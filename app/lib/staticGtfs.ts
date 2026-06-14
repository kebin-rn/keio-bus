import JSZip from "jszip";

const STATIC_GTFS_URL = "https://api.odpt.org/api/v4/files/odpt/KeioBus/AllLines.zip";

const TTL_MS = 24 * 60 * 60 * 1000;

// ODPT の GTFS ファイルは版ごとに ?date=YYYYMMDD が付与され、版が更新されると
// 古い date は 404 になる。固定値だと配信切替で壊れるため、候補を順に試して
// 最初に zip が取れたものを採用する。
//  1. KEIO_BUS_GTFS_DATE が指定されていればそれを最優先
//  2. date 指定なし (最新版が返ることを期待)
//  3. 直近 8 ヶ月の月初
//  4. 既知の版 20260401 を保険として最後に
function candidateDates(): (string | null)[] {
  const out: (string | null)[] = [];
  const seen = new Set<string>();
  const push = (d: string | null) => {
    const k = d ?? "__none__";
    if (seen.has(k)) return;
    seen.add(k);
    out.push(d);
  };

  if (process.env.KEIO_BUS_GTFS_DATE) push(process.env.KEIO_BUS_GTFS_DATE);
  push(null);
  const now = new Date();
  for (let i = 0; i < 8; i += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    push(`${y}${m}01`);
  }
  push("20260401");
  return out;
}

// 一度成功した date を覚えておき、次回ロード時に最優先で試す
let knownGoodDate: string | null | undefined = undefined;

async function fetchZip(date: string | null, key: string): Promise<ArrayBuffer | null> {
  const url = new URL(STATIC_GTFS_URL);
  if (date) url.searchParams.set("date", date);
  url.searchParams.set("acl:consumerKey", key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url.toString(), {
      cache: "no-store",
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const head = new Uint8Array(buf.slice(0, 4));
    if (head[0] !== 0x50 || head[1] !== 0x4b) return null; // not a zip
    return buf;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface RouteInfo {
  routeId: string;
  agencyId?: string;
  shortName?: string;
  longName?: string;
  color?: string;
  textColor?: string;
}

export interface OfficeInfo {
  officeId: string;
  name: string;
}

export interface StopInfo {
  stopId: string;
  name: string;
  lat?: number;
  lng?: number;
}

export interface TripInfo {
  tripId: string;
  routeId?: string;
  headsign?: string;
  directionId?: number;
  officeId?: string;
}

export interface StaticGtfs {
  offices: Record<string, OfficeInfo>;
  routes: Record<string, RouteInfo>;
  stops: Record<string, StopInfo>;
  trips: Record<string, TripInfo>;
  loadedAt: number;
  sourceUrl: string;
}

let cache: StaticGtfs | null = null;
let inflight: Promise<StaticGtfs> | null = null;
let lastError: string | null = null;

export function getCachedStaticGtfs(): {
  data: StaticGtfs | null;
  error: string | null;
} {
  const fresh = cache && Date.now() - cache.loadedAt < TTL_MS ? cache : null;
  return { data: fresh ?? cache, error: lastError };
}

// 確実にロードを待つ。成功すればモジュールキャッシュに保持し、TTL 内は再取得しない。
// 失敗してもキャッシュ済みデータがあればそれを返す（古くても無いよりまし）。
export async function getStaticGtfs(): Promise<StaticGtfs | null> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache;
  if (!inflight) {
    inflight = loadStaticGtfs()
      .then((data) => {
        cache = data;
        lastError = null;
        return data;
      })
      .catch((e) => {
        lastError = e instanceof Error ? e.message : String(e);
        throw e;
      })
      .finally(() => {
        inflight = null;
      });
  }
  try {
    return await inflight;
  } catch {
    return cache; // ロード失敗時は（あれば）古いキャッシュ
  }
}

async function loadStaticGtfs(): Promise<StaticGtfs> {
  const key = process.env.ODPT_CONSUMER_KEY;
  if (!key) throw new Error("ODPT_CONSUMER_KEY is not set");

  const candidates =
    knownGoodDate !== undefined
      ? [knownGoodDate, ...candidateDates().filter((d) => d !== knownGoodDate)]
      : candidateDates();

  let buf: ArrayBuffer | null = null;
  let usedDate: string | null = null;
  const tried: string[] = [];
  for (const date of candidates) {
    tried.push(date ?? "(no date)");
    buf = await fetchZip(date, key);
    if (buf) {
      usedDate = date;
      break;
    }
  }

  if (!buf) {
    throw new Error(`no working static GTFS version (tried: ${tried.join(", ")})`);
  }
  knownGoodDate = usedDate;

  const zip = await JSZip.loadAsync(buf);

  const [officeCsv, routesCsv, stopsCsv, tripsCsv] = await Promise.all([
    zip.file("office_jp.txt")?.async("string") ?? Promise.resolve(""),
    zip.file("routes.txt")?.async("string") ?? Promise.resolve(""),
    zip.file("stops.txt")?.async("string") ?? Promise.resolve(""),
    zip.file("trips.txt")?.async("string") ?? Promise.resolve(""),
  ]);

  return {
    offices: parseOffices(officeCsv),
    routes: parseRoutes(routesCsv),
    stops: parseStops(stopsCsv),
    trips: parseTrips(tripsCsv),
    loadedAt: Date.now(),
    sourceUrl: usedDate ? `${STATIC_GTFS_URL}?date=${usedDate}` : STATIC_GTFS_URL,
  };
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  if (!text) return rows;
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return rows;
  const header = splitCsvLine(lines[0]).map((h) => h.replace(/^﻿/, ""));
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) row[header[j]] = cells[j] ?? "";
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else cur += c;
    } else {
      if (c === ",") {
        out.push(cur);
        cur = "";
      } else if (c === '"') inQuote = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseOffices(csv: string): Record<string, OfficeInfo> {
  const out: Record<string, OfficeInfo> = {};
  for (const row of parseCsv(csv)) {
    const id = row["office_id"];
    const name = row["office_name"];
    if (!id || !name) continue;
    out[id] = { officeId: id, name };
  }
  return out;
}

function parseRoutes(csv: string): Record<string, RouteInfo> {
  const out: Record<string, RouteInfo> = {};
  for (const row of parseCsv(csv)) {
    const id = row["route_id"];
    if (!id) continue;
    out[id] = {
      routeId: id,
      agencyId: row["agency_id"] || undefined,
      shortName: row["route_short_name"] || undefined,
      longName: row["route_long_name"] || undefined,
      color: row["route_color"] || undefined,
      textColor: row["route_text_color"] || undefined,
    };
  }
  return out;
}

function parseStops(csv: string): Record<string, StopInfo> {
  const out: Record<string, StopInfo> = {};
  for (const row of parseCsv(csv)) {
    const id = row["stop_id"];
    if (!id) continue;
    out[id] = {
      stopId: id,
      name: row["stop_name"] || id,
      lat: row["stop_lat"] ? Number(row["stop_lat"]) : undefined,
      lng: row["stop_lon"] ? Number(row["stop_lon"]) : undefined,
    };
  }
  return out;
}

function parseTrips(csv: string): Record<string, TripInfo> {
  const out: Record<string, TripInfo> = {};
  for (const row of parseCsv(csv)) {
    const id = row["trip_id"];
    if (!id) continue;
    out[id] = {
      tripId: id,
      routeId: row["route_id"] || undefined,
      headsign: row["trip_headsign"] || undefined,
      directionId: row["direction_id"]
        ? Number(row["direction_id"])
        : undefined,
      officeId: row["jp_office_id"] || undefined,
    };
  }
  return out;
}

import JSZip from "jszip";

const STATIC_GTFS_URL = "https://api.odpt.org/api/v4/files/odpt/KeioBus/AllLines.zip";

const TTL_MS = 24 * 60 * 60 * 1000;

// ODPT の GTFS ファイルは版ごとに ?date=YYYYMMDD が付与される。版が更新されると
// 古い date は 404 になり、しかも版日付は月初などの規則的な値ではなく不定
// (例: 20260404)。date 省略も 404。よって有効な版日付を実行時に「探索」する:
// 直近 N 日を新しい順に Range で軽く叩き、最初に zip が返った日付を採用する。
const SCAN_DAYS = 180;
const SCAN_BATCH = 24;

function recentDates(days: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(now.getTime() - i * 86400000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    out.push(`${y}${m}${day}`);
  }
  return out;
}

// 一度成功した date を覚えておき、次回ロード時に最優先で試す
let knownGoodDate: string | undefined = undefined;

function gtfsUrl(date: string, key: string): string {
  const url = new URL(STATIC_GTFS_URL);
  url.searchParams.set("date", date);
  url.searchParams.set("acl:consumerKey", key);
  return url.toString();
}

// 先頭数バイトだけ取得して「その日付の版が存在し zip か」を安価に判定
async function hasZip(date: string, key: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(gtfsUrl(date, key), {
      cache: "no-store",
      signal: controller.signal,
      redirect: "follow",
      headers: { Range: "bytes=0-3" },
    });
    if (!(res.ok || res.status === 206)) return false;
    const buf = await res.arrayBuffer();
    const head = new Uint8Array(buf.slice(0, 2));
    return head[0] === 0x50 && head[1] === 0x4b;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// 直近 SCAN_DAYS 日を新しい順にバッチ探索し、最初にヒットしたバッチ内の最新日付を返す
async function discoverDate(key: string): Promise<string | undefined> {
  const dates = recentDates(SCAN_DAYS);
  for (let i = 0; i < dates.length; i += SCAN_BATCH) {
    const batch = dates.slice(i, i + SCAN_BATCH); // 既に新しい順
    const flags = await Promise.all(batch.map((d) => hasZip(d, key)));
    const hitIdx = flags.findIndex(Boolean);
    if (hitIdx !== -1) return batch[hitIdx];
  }
  return undefined;
}

async function downloadZip(date: string, key: string): Promise<ArrayBuffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(gtfsUrl(date, key), {
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

async function resolveZip(
  key: string,
): Promise<{ buf: ArrayBuffer; date: string }> {
  // 1) 手動ピン (KEIO_BUS_GTFS_DATE) → 2) 既知の正解 → 両者ダメなら探索
  const preferred = process.env.KEIO_BUS_GTFS_DATE || knownGoodDate;
  if (preferred) {
    const buf = await downloadZip(preferred, key);
    if (buf) return { buf, date: preferred };
  }

  const discovered = await discoverDate(key);
  if (!discovered) {
    throw new Error(
      `no working static GTFS version found in last ${SCAN_DAYS} days`,
    );
  }
  const buf = await downloadZip(discovered, key);
  if (!buf) {
    throw new Error(`discovered date ${discovered} but download failed`);
  }
  return { buf, date: discovered };
}

async function loadStaticGtfs(): Promise<StaticGtfs> {
  const key = process.env.ODPT_CONSUMER_KEY;
  if (!key) throw new Error("ODPT_CONSUMER_KEY is not set");

  const { buf, date: usedDate } = await resolveZip(key);
  knownGoodDate = usedDate;

  const zip = await JSZip.loadAsync(buf);

  const [officeCsv, routesCsv, stopsCsv, tripsCsv, stopTimesCsv] =
    await Promise.all([
      zip.file("office_jp.txt")?.async("string") ?? Promise.resolve(""),
      zip.file("routes.txt")?.async("string") ?? Promise.resolve(""),
      zip.file("stops.txt")?.async("string") ?? Promise.resolve(""),
      zip.file("trips.txt")?.async("string") ?? Promise.resolve(""),
      zip.file("stop_times.txt")?.async("string") ?? Promise.resolve(""),
    ]);

  const trips = parseTrips(tripsCsv);
  // 京王バスの trips.txt は trip_headsign が空で、行き先は stop_times.txt の
  // stop_headsign 側に入っている。trip_id ごとに最初の stop_headsign を方面として採用。
  const headsignByTrip = parseStopHeadsignsByTrip(stopTimesCsv);
  for (const t of Object.values(trips)) {
    if (!t.headsign && headsignByTrip[t.tripId]) {
      t.headsign = headsignByTrip[t.tripId];
    }
  }

  return {
    offices: parseOffices(officeCsv),
    routes: parseRoutes(routesCsv),
    stops: parseStops(stopsCsv),
    trips,
    loadedAt: Date.now(),
    sourceUrl: `${STATIC_GTFS_URL}?date=${usedDate}`,
  };
}

// stop_times.txt は ~45 万行と大きいので、full parseCsv は避けて trip_id と
// stop_headsign の 2 列だけを行単位で抜き出す。同じ trip_id の 1 件目だけ採用。
function parseStopHeadsignsByTrip(csv: string): Record<string, string> {
  if (!csv) return {};
  const lines = csv.split(/\r?\n/);
  if (lines.length < 2) return {};
  const header = splitCsvLine(lines[0]).map((h) => h.replace(/^﻿/, ""));
  const tripIdx = header.indexOf("trip_id");
  const headIdx = header.indexOf("stop_headsign");
  if (tripIdx < 0 || headIdx < 0) return {};
  const out: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cells = splitCsvLine(line);
    const tid = cells[tripIdx];
    const head = cells[headIdx];
    if (!tid || !head || out[tid]) continue;
    out[tid] = head;
  }
  return out;
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

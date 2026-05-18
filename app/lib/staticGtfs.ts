import JSZip from "jszip";

const CANDIDATE_URLS = [
  "https://api.odpt.org/api/v4/files/odpt_KeioBus_AllLines_gtfs.zip",
  "https://api.odpt.org/api/v4/files/odpt_KeioBus_AllLines.zip",
  "https://api.odpt.org/api/v4/files/keio_bus_all_lines.zip",
  "https://api.odpt.org/api/v4/gtfs/static/odpt_KeioBus_AllLines.zip",
  "https://api.odpt.org/api/v4/gtfs/odpt_KeioBus_AllLines.zip",
  "https://api.odpt.org/api/v4/gtfs/odpt_KeioBus_AllLines",
];

const TTL_MS = 24 * 60 * 60 * 1000;

export interface RouteInfo {
  routeId: string;
  agencyId?: string;
  shortName?: string;
  longName?: string;
  color?: string;
  textColor?: string;
}

export interface AgencyInfo {
  agencyId: string;
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
}

export interface StaticGtfs {
  agencies: Record<string, AgencyInfo>;
  routes: Record<string, RouteInfo>;
  stops: Record<string, StopInfo>;
  trips: Record<string, TripInfo>;
  loadedAt: number;
  sourceUrl: string;
}

let cache: StaticGtfs | null = null;
let inflight: Promise<StaticGtfs> | null = null;

export async function getStaticGtfs(): Promise<StaticGtfs> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < TTL_MS) return cache;
  if (inflight) return inflight;

  inflight = loadStaticGtfs()
    .then((data) => {
      cache = data;
      return data;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

async function loadStaticGtfs(): Promise<StaticGtfs> {
  const key = process.env.ODPT_CONSUMER_KEY;
  if (!key) throw new Error("ODPT_CONSUMER_KEY is not set");

  const errors: string[] = [];
  let buf: ArrayBuffer | null = null;
  let usedUrl = "";

  for (const url of CANDIDATE_URLS) {
    const full = `${url}?acl:consumerKey=${encodeURIComponent(key)}`;
    try {
      const res = await fetch(full, { cache: "no-store" });
      if (!res.ok) {
        errors.push(`${url} → ${res.status}`);
        continue;
      }
      const contentType = res.headers.get("content-type") || "";
      const candidate = await res.arrayBuffer();
      const head = new Uint8Array(candidate.slice(0, 4));
      const isZip = head[0] === 0x50 && head[1] === 0x4b;
      if (!isZip) {
        errors.push(`${url} → not a zip (${contentType})`);
        continue;
      }
      buf = candidate;
      usedUrl = url;
      break;
    } catch (e) {
      errors.push(`${url} → ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!buf) {
    throw new Error(`no static GTFS URL worked: ${errors.join("; ")}`);
  }

  const zip = await JSZip.loadAsync(buf);

  const [agencyCsv, routesCsv, stopsCsv, tripsCsv] = await Promise.all([
    zip.file("agency.txt")?.async("string") ?? Promise.resolve(""),
    zip.file("routes.txt")?.async("string") ?? Promise.resolve(""),
    zip.file("stops.txt")?.async("string") ?? Promise.resolve(""),
    zip.file("trips.txt")?.async("string") ?? Promise.resolve(""),
  ]);

  return {
    agencies: parseAgencies(agencyCsv),
    routes: parseRoutes(routesCsv),
    stops: parseStops(stopsCsv),
    trips: parseTrips(tripsCsv),
    loadedAt: Date.now(),
    sourceUrl: usedUrl,
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

function parseAgencies(csv: string): Record<string, AgencyInfo> {
  const out: Record<string, AgencyInfo> = {};
  for (const row of parseCsv(csv)) {
    const id = row["agency_id"];
    const name = row["agency_name"];
    if (!id || !name) continue;
    out[id] = { agencyId: id, name };
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
    };
  }
  return out;
}

import JSZip from "jszip";

const STATIC_GTFS_URL =
  "https://api.odpt.org/api/v4/files/odpt_KeioBus_AllLines_gtfs.zip";

const TTL_MS = 24 * 60 * 60 * 1000;

export interface RouteInfo {
  routeId: string;
  shortName?: string;
  longName?: string;
  color?: string;
  textColor?: string;
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
  routes: Record<string, RouteInfo>;
  stops: Record<string, StopInfo>;
  trips: Record<string, TripInfo>;
  loadedAt: number;
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

  const res = await fetch(
    `${STATIC_GTFS_URL}?acl:consumerKey=${encodeURIComponent(key)}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`static GTFS ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  const [routesCsv, stopsCsv, tripsCsv] = await Promise.all([
    zip.file("routes.txt")?.async("string") ?? Promise.resolve(""),
    zip.file("stops.txt")?.async("string") ?? Promise.resolve(""),
    zip.file("trips.txt")?.async("string") ?? Promise.resolve(""),
  ]);

  return {
    routes: parseRoutes(routesCsv),
    stops: parseStops(stopsCsv),
    trips: parseTrips(tripsCsv),
    loadedAt: Date.now(),
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

function parseRoutes(csv: string): Record<string, RouteInfo> {
  const out: Record<string, RouteInfo> = {};
  for (const row of parseCsv(csv)) {
    const id = row["route_id"];
    if (!id) continue;
    out[id] = {
      routeId: id,
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

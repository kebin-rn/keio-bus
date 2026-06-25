import { NextResponse } from "next/server";
import JSZip from "jszip";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STATIC_GTFS_URL =
  "https://api.odpt.org/api/v4/files/odpt/KeioBus/AllLines.zip";

function recent(days: number): string[] {
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

async function hasZip(date: string, key: string) {
  const url = new URL(STATIC_GTFS_URL);
  url.searchParams.set("date", date);
  url.searchParams.set("acl:consumerKey", key);
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 8000);
    const r = await fetch(url.toString(), {
      headers: { Range: "bytes=0-3" },
      signal: c.signal,
      cache: "no-store",
    });
    clearTimeout(t);
    if (!(r.ok || r.status === 206)) return false;
    const buf = await r.arrayBuffer();
    const h = new Uint8Array(buf.slice(0, 2));
    return h[0] === 0x50 && h[1] === 0x4b;
  } catch {
    return false;
  }
}

export async function GET() {
  const key = process.env.ODPT_CONSUMER_KEY || "";
  const dates = recent(150);
  let chosen: string | null = null;
  for (let i = 0; i < dates.length; i += 24) {
    const batch = dates.slice(i, i + 24);
    const flags = await Promise.all(batch.map((d) => hasZip(d, key)));
    const idx = flags.findIndex(Boolean);
    if (idx !== -1) {
      chosen = batch[idx];
      break;
    }
  }
  if (!chosen) return NextResponse.json({ error: "no date" }, { status: 500 });

  const url = new URL(STATIC_GTFS_URL);
  url.searchParams.set("date", chosen);
  url.searchParams.set("acl:consumerKey", key);
  const res = await fetch(url.toString(), { cache: "no-store" });
  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  const out: Record<string, unknown> = { date: chosen };
  for (const fname of ["trips.txt", "stop_times.txt", "feed_info.txt"]) {
    const file = zip.file(fname);
    if (!file) continue;
    const text = await file.async("string");
    const lines = text.split(/\r?\n/).filter(Boolean);
    out[fname] = {
      headerLine: lines[0],
      header: lines[0]
        ?.replace(/^﻿/, "")
        .split(",")
        .map((s) => s.trim()),
      firstRows: lines.slice(1, 6),
      totalRows: lines.length - 1,
    };
  }
  return NextResponse.json(out);
}

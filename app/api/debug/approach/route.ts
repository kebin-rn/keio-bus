import { NextResponse } from "next/server";
import { fetchKeioBusFeeds } from "@/app/lib/gtfsrt";
import { getStaticGtfs } from "@/app/lib/staticGtfs";
import JSZip from "jszip";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* eslint-disable @typescript-eslint/no-explicit-any */

const STATIC_GTFS_URL =
  "https://api.odpt.org/api/v4/files/odpt/KeioBus/AllLines.zip";

async function loadStopTimesForTrip(tripId: string, date: string) {
  const key = process.env.ODPT_CONSUMER_KEY || "";
  const url = new URL(STATIC_GTFS_URL);
  url.searchParams.set("date", date);
  url.searchParams.set("acl:consumerKey", key);
  const res = await fetch(url.toString(), { cache: "no-store" });
  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const text = (await zip.file("stop_times.txt")?.async("string")) ?? "";
  const lines = text.split(/\r?\n/);
  const header = lines[0].replace(/^﻿/, "").split(",");
  const iTrip = header.indexOf("trip_id");
  const iStop = header.indexOf("stop_id");
  const iSeq = header.indexOf("stop_sequence");
  const iArr = header.indexOf("arrival_time");
  const iHead = header.indexOf("stop_headsign");
  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    // 素朴 split（stop_headsign にカンマが無い前提の簡易チェック）
    const c = line.split(",");
    if (c[iTrip] !== tripId) continue;
    rows.push({
      seq: Number(c[iSeq]),
      stopId: c[iStop],
      arrivalTime: c[iArr],
      headsign: c[iHead],
    });
  }
  rows.sort((a, b) => a.seq - b.seq);
  return rows;
}

export async function GET() {
  const { vehicles, tripUpdates } = await fetchKeioBusFeeds();
  const stat = await getStaticGtfs();

  const vEnts = vehicles.entity as any[];
  const tEnts = (tripUpdates?.entity ?? []) as any[];

  // vehicle と trip_update 両方に存在する trip をひとつ選ぶ
  const tuByTrip = new Map<string, any>();
  for (const e of tEnts) {
    const tid = e.tripUpdate?.trip?.tripId;
    if (tid) tuByTrip.set(tid, e.tripUpdate);
  }
  const target = vEnts.find(
    (e) => e.vehicle?.trip?.tripId && tuByTrip.has(e.vehicle.trip.tripId),
  );
  const tripId = target?.vehicle?.trip?.tripId;
  const v = target?.vehicle;
  const tu = tripId ? tuByTrip.get(tripId) : null;

  const nameOf = (sid: string) => stat?.stops[sid]?.name ?? sid;

  const staticRows = tripId
    ? await loadStopTimesForTrip(tripId, stat?.sourceUrl.split("date=")[1] ?? "")
    : [];

  return NextResponse.json({
    tripId,
    routeId: v?.trip?.routeId,
    vehicle: {
      currentStopSequence: v?.currentStopSequence,
      stopId: v?.stopId,
      stopName: v?.stopId ? nameOf(v.stopId) : null,
    },
    tripUpdate_delay: tu?.delay,
    tripUpdate_stops: (tu?.stopTimeUpdate ?? []).map((s: any) => ({
      seq: s.stopSequence,
      stopId: s.stopId,
      name: nameOf(s.stopId),
    })),
    static_stops: staticRows.map((r) => ({
      seq: r.seq,
      stopId: r.stopId,
      name: nameOf(r.stopId),
      arrivalTime: r.arrivalTime,
      headsign: r.headsign,
    })),
  });
}

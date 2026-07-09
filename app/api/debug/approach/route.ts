import { NextResponse } from "next/server";
import { fetchKeioBusFeeds } from "@/app/lib/gtfsrt";
import { getStaticGtfs } from "@/app/lib/staticGtfs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET() {
  const { vehicles, tripUpdates } = await fetchKeioBusFeeds();
  const stat = await getStaticGtfs();

  const vEnts = vehicles.entity as any[];
  const tEnts = (tripUpdates?.entity ?? []) as any[];

  // --- vehicle feed: current_stop_sequence の有無 ---
  const vSample = vEnts.slice(0, 3).map((e) => {
    const v = e.vehicle ?? {};
    return {
      tripId: v.trip?.tripId,
      routeId: v.trip?.routeId,
      currentStopSequence: v.currentStopSequence,
      stopId: v.stopId,
      hasPosition: !!v.position,
    };
  });
  const vWithSeq = vEnts.filter(
    (e) => e.vehicle?.currentStopSequence !== undefined,
  ).length;

  // --- trip_update feed: stop_time_update の完全性 ---
  const stuCounts = tEnts
    .map((e) => (e.tripUpdate?.stopTimeUpdate ?? []).length)
    .sort((a, b) => a - b);
  const stuSummary = {
    trips: tEnts.length,
    min: stuCounts[0],
    median: stuCounts[Math.floor(stuCounts.length / 2)],
    max: stuCounts[stuCounts.length - 1],
    withMoreThanOne: stuCounts.filter((n) => n > 1).length,
  };

  // 先頭 trip の stop_time_update を詳しく（stop_id / seq / arrival.time / delay）
  const firstTu = tEnts[0]?.tripUpdate;
  const firstTuDetail = {
    tripId: firstTu?.trip?.tripId,
    routeId: firstTu?.trip?.routeId,
    delay: firstTu?.delay,
    stopTimeUpdate: (firstTu?.stopTimeUpdate ?? []).slice(0, 8).map((s: any) => ({
      stopSequence: s.stopSequence,
      stopId: s.stopId,
      arrivalTime: s.arrival?.time,
      arrivalDelay: s.arrival?.delay,
      departureTime: s.departure?.time,
    })),
  };

  // --- static 規模 ---
  const staticInfo = {
    stops: stat ? Object.keys(stat.stops).length : 0,
    trips: stat ? Object.keys(stat.trips).length : 0,
  };

  return NextResponse.json({
    now: new Date().toISOString(),
    vehicle: {
      count: vEnts.length,
      withCurrentStopSequence: vWithSeq,
      sample: vSample,
    },
    tripUpdate: {
      count: tEnts.length,
      stopTimeUpdate: stuSummary,
      firstDetail: firstTuDetail,
    },
    static: staticInfo,
  });
}

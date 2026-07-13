import { NextRequest, NextResponse } from "next/server";
import { fetchKeioBusFeeds } from "@/app/lib/gtfsrt";
import { getStaticGtfs, type StaticGtfs } from "@/app/lib/staticGtfs";
import { getSchedule, scheduleKey } from "@/app/lib/schedule";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function routeTitleOf(stat: StaticGtfs, routeId: string): string {
  const r = stat.routes[routeId];
  if (!r) return routeId;
  if (r.shortName) {
    return r.longName ? `${r.shortName} ${r.longName}` : r.shortName;
  }
  return r.longName || routeId;
}

export interface Approach {
  tripId: string;
  routeId?: string;
  routeTitle?: string;
  headsign?: string;
  officeId?: string;
  officeName?: string;
  stopsAway: number;
  delay?: number;
  nextStopName?: string;
  etaSec?: number; // 0時起点の秒（到着予定=定刻+delay）。24時超えは 86400 で剰余して表示
  vehicleNumber?: string;
  lat?: number;
  lng?: number;
}

export async function GET(req: NextRequest) {
  // 同名停留所は複数ポール (のりば) を持つため、stop はカンマ区切りで
  // 複数 ID を受け取る。各便はそのうち最初に到達するポールで判定する。
  const stopParam = req.nextUrl.searchParams.get("stop");
  if (!stopParam) {
    return NextResponse.json({ error: "stop parameter required" }, { status: 400 });
  }
  const stopIds = stopParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (stopIds.length === 0 || stopIds.length > 50) {
    return NextResponse.json({ error: "invalid stop parameter" }, { status: 400 });
  }
  const stopIdSet = new Set(stopIds);

  try {
    const [{ vehicles, tripUpdates }, stat, schedule] = await Promise.all([
      fetchKeioBusFeeds(),
      getStaticGtfs(),
      getSchedule().catch(() => null),
    ]);

    if (!stat) {
      return NextResponse.json(
        { error: "static GTFS unavailable" },
        { status: 503 },
      );
    }

    // trip_id → 現在の車両位置（current_stop_sequence を得るため）
    const vehByTrip = new Map<string, (typeof vehicles.entity)[number]["vehicle"]>();
    for (const ent of vehicles.entity) {
      const v = ent.vehicle;
      const tid = v?.trip?.tripId;
      if (tid) vehByTrip.set(tid, v);
    }

    const approaches: Approach[] = [];

    for (const ent of tripUpdates?.entity ?? []) {
      const tu = ent.tripUpdate;
      const tid = tu?.trip?.tripId;
      if (!tu || !tid) continue;

      const veh = vehByTrip.get(tid);
      const curSeq = veh?.currentStopSequence;
      if (veh === undefined || curSeq === undefined) continue; // 位置不明は除外

      const stus = tu.stopTimeUpdate ?? [];

      // これから到達する対象ポール（seq >= 現在seq）のうち最初のもの
      let targetSeq: number | undefined;
      for (const s of stus) {
        if (
          s.stopId !== undefined &&
          stopIdSet.has(s.stopId) &&
          s.stopSequence !== undefined &&
          s.stopSequence >= curSeq &&
          (targetSeq === undefined || s.stopSequence < targetSeq)
        ) {
          targetSeq = s.stopSequence;
        }
      }
      if (targetSeq === undefined) continue; // この便はこの先この停留所を通らない

      const stopsAway = targetSeq - curSeq;

      // バスの「次の停留所」= seq >= 現在seq の最小
      let nextStopId: string | undefined;
      let bestSeq = Infinity;
      for (const s of stus) {
        if (
          s.stopSequence !== undefined &&
          s.stopSequence >= curSeq &&
          s.stopSequence < bestSeq
        ) {
          bestSeq = s.stopSequence;
          nextStopId = s.stopId ?? undefined;
        }
      }

      const trip = stat.trips[tid];
      const routeId = trip?.routeId;
      const delay = tu.delay;

      let etaSec: number | undefined;
      if (schedule) {
        // 定刻はこの通過 (targetSeq) のものを引く。循環路線でも取り違えない。
        const base = schedule.get(scheduleKey(tid, targetSeq));
        if (base !== undefined) etaSec = base + (delay ?? 0);
      }

      approaches.push({
        tripId: tid,
        routeId,
        routeTitle: routeId ? routeTitleOf(stat, routeId) : undefined,
        headsign: trip?.headsign,
        officeId: trip?.officeId,
        officeName: trip?.officeId
          ? stat.offices[trip.officeId]?.name
          : undefined,
        stopsAway,
        delay,
        nextStopName: nextStopId ? stat.stops[nextStopId]?.name : undefined,
        etaSec,
        vehicleNumber: veh.vehicle?.label || veh.vehicle?.id || undefined,
        lat: veh.position?.latitude,
        lng: veh.position?.longitude,
      });
    }

    approaches.sort((a, b) => {
      if (a.stopsAway !== b.stopsAway) return a.stopsAway - b.stopsAway;
      return (a.etaSec ?? Infinity) - (b.etaSec ?? Infinity);
    });

    const first = stopIds.map((id) => stat.stops[id]).find(Boolean);
    return NextResponse.json({
      stop: first
        ? { ids: stopIds, name: first.name, lat: first.lat, lng: first.lng }
        : { ids: stopIds, name: stopIds[0] },
      approaches,
      scheduleAvailable: schedule !== null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { fetchKeioBusFeeds } from "@/app/lib/gtfsrt";
import { getStaticGtfs, routeTitleOf } from "@/app/lib/staticGtfs";
import { getSchedule, scheduleKey } from "@/app/lib/schedule";
import { tripProgress } from "@/app/lib/tripProgress";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface TripStop {
  seq: number;
  stopId: string;
  name: string | null; // 静的 GTFS に無い停留所は null (画面側で「停留所名不明」)
  scheduledSec?: number; // 定刻 (0時起点の秒、24時超えあり)
  predictedSec?: number; // 到着予想 = 定刻 + 便の現在の遅延 (未通過の停留所のみ)
  state: "passed" | "current" | "upcoming";
}

export interface TripDetail {
  tripId: string;
  routeTitle?: string;
  headsign?: string;
  officeName?: string;
  vehicleNumber?: string;
  delay?: number;
  currentStopSequence: number; // 停留所列上の現在位置 (便の開始前は始発の seq)
  // 始発をまだ発車していない (current 行 = 始発)
  beforeDeparture: boolean;
  // current 行のバスの状態。フィードは INCOMING_AT / STOPPED_AT を送ってくる
  vehicleStatus: "stopped" | "approaching";
  lat?: number;
  lng?: number;
}

const STOPPED_AT = 1;

// 便の全停留所と到着予想を返す。
// 停留所列は trip_update から組む: 京王バスのフィードは各便の全停留所を
// stop_sequence 1 から列挙している (通過済みも含む) ため、静的 GTFS に
// 載っていない便でも停留所一覧は出せる。停留所ごとの予測時刻はフィードに
// 無いので、到着予想は静的な定刻 + 便単位の遅延で算出する (接近ボードの
// 「◯◯着予定」と同じ計算)。
export async function GET(req: NextRequest) {
  const tripId = req.nextUrl.searchParams.get("id");
  if (!tripId || tripId.length > 128) {
    return NextResponse.json({ error: "invalid id parameter" }, { status: 400 });
  }

  try {
    const [{ vehicles, tripUpdates, stale: feedStale }, stat, schedule] =
      await Promise.all([
        fetchKeioBusFeeds(),
        getStaticGtfs(),
        getSchedule().catch(() => null),
      ]);

    if (!tripUpdates) {
      return NextResponse.json(
        { error: "リアルタイム便情報 (trip_update) を一時的に取得できません" },
        { status: 503 },
      );
    }

    const tu = tripUpdates.entity.find(
      (e) => e.tripUpdate?.trip?.tripId === tripId,
    )?.tripUpdate;
    const veh = vehicles.entity.find(
      (e) => e.vehicle?.trip?.tripId === tripId,
    )?.vehicle;
    const curSeq = veh?.currentStopSequence;
    if (!tu || !veh || curSeq === undefined) {
      return NextResponse.json(
        { error: "この便は現在運行していないか、情報を取得できません" },
        { status: 404 },
      );
    }

    const rtStops = (tu.stopTimeUpdate ?? [])
      .filter(
        (s): s is typeof s & { stopSequence: number; stopId: string } =>
          s.stopSequence !== undefined && s.stopId !== undefined,
      )
      .sort((a, b) => a.stopSequence - b.stopSequence);
    const progress = tripProgress(
      curSeq,
      rtStops.map((s) => s.stopSequence),
      tu.delay,
    );
    const cur = progress.effectiveSeq;
    const delay = progress.effectiveDelay;

    const stops: TripStop[] = rtStops.map((s) => {
      const state: TripStop["state"] =
        s.stopSequence < cur
          ? "passed"
          : s.stopSequence === cur
            ? "current"
            : "upcoming";
      const scheduledSec = schedule?.get(scheduleKey(tripId, s.stopSequence));
      return {
        seq: s.stopSequence,
        stopId: s.stopId,
        name: stat?.stops[s.stopId]?.name ?? null,
        scheduledSec,
        predictedSec:
          state !== "passed" && scheduledSec !== undefined
            ? scheduledSec + delay
            : undefined,
        state,
      };
    });

    const staticTrip = stat?.trips[tripId];
    const routeId = staticTrip?.routeId;
    const trip: TripDetail = {
      tripId,
      routeTitle: stat && routeId ? routeTitleOf(stat, routeId) : undefined,
      headsign: staticTrip?.headsign,
      officeName:
        stat && staticTrip?.officeId
          ? stat.offices[staticTrip.officeId]?.name
          : undefined,
      vehicleNumber: veh.vehicle?.label || veh.vehicle?.id || undefined,
      delay,
      currentStopSequence: cur,
      beforeDeparture: progress.beforeDeparture,
      vehicleStatus: veh.currentStatus === STOPPED_AT ? "stopped" : "approaching",
      lat: veh.position?.latitude,
      lng: veh.position?.longitude,
    };

    return NextResponse.json({
      trip,
      stops,
      scheduleAvailable: schedule !== null,
      feedStale,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

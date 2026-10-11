import { NextRequest, NextResponse } from "next/server";
import { fetchKeioBusFeeds } from "@/app/lib/gtfsrt";
import { getStaticGtfs } from "@/app/lib/staticGtfs";
import {
  getShapeLegs,
  routesApiConfigured,
  RoutesApiError,
} from "@/app/lib/routeShape";
import type { ShapePoint } from "@/app/lib/routeShapeCore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface ShapeSegment {
  fromSeq: number;
  toSeq: number;
  // 道路に沿った経路 (encoded polyline)。求められなかった区間は null で、
  // 地図側は停留所を結んだおおよその経路 (点線) で表示する
  path: string | null;
}

// 地図に描く便の経路形状。停留所列は運行中の便の trip_update から取る
// (静的 GTFS に無い便でも描ける)。経路計算に使うのは座標のある停留所のみ
export async function GET(req: NextRequest) {
  const tripId = req.nextUrl.searchParams.get("trip");
  if (!tripId || tripId.length > 128) {
    return NextResponse.json({ error: "invalid trip parameter" }, { status: 400 });
  }
  if (!routesApiConfigured()) {
    return NextResponse.json({ available: false });
  }

  try {
    const [{ tripUpdates }, stat] = await Promise.all([
      fetchKeioBusFeeds(),
      getStaticGtfs(),
    ]);
    const tu = tripUpdates?.entity.find(
      (e) => e.tripUpdate?.trip?.tripId === tripId,
    )?.tripUpdate;
    if (!tu || !stat) {
      return NextResponse.json(
        { available: true, error: "この便の停留所情報を取得できません" },
        { status: 404 },
      );
    }

    const stops: (ShapePoint & { seq: number })[] = [];
    for (const s of [...(tu.stopTimeUpdate ?? [])].sort(
      (a, b) => (a.stopSequence ?? 0) - (b.stopSequence ?? 0),
    )) {
      if (s.stopSequence === undefined || s.stopId === undefined) continue;
      const st = stat.stops[s.stopId];
      if (st?.lat === undefined || st.lng === undefined) continue;
      stops.push({ seq: s.stopSequence, stopId: s.stopId, lat: st.lat, lng: st.lng });
    }

    const legs = await getShapeLegs(
      stops.map(({ stopId, lat, lng }) => ({ stopId, lat, lng })),
    );
    const segments: ShapeSegment[] = stops.slice(0, -1).map((s, i) => ({
      fromSeq: s.seq,
      toSeq: stops[i + 1].seq,
      path: legs[i] ?? null,
    }));
    return NextResponse.json({
      available: true,
      segments,
      roadSegments: segments.filter((s) => s.path !== null).length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    // Routes API の一時的な失敗・設定の誤りは 503 (画面はおおよその経路で表示を続ける)。
    // キーや API の有効化の誤りに気付けるよう、理由をログに残す
    if (e instanceof RoutesApiError) console.warn(`[shape] ${message}`);
    return NextResponse.json(
      { available: true, error: message },
      { status: e instanceof RoutesApiError ? 503 : 500 },
    );
  }
}

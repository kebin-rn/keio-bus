import { NextResponse } from "next/server";
import { getStaticGtfs } from "@/app/lib/staticGtfs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// バス停検索・選択用の全停留所リスト。静的GTFS由来で日次程度しか変わらないため
// クライアント側でキャッシュして使う想定。
export async function GET() {
  const stat = await getStaticGtfs();
  if (!stat) {
    return NextResponse.json(
      { stops: [], error: "static GTFS unavailable" },
      { status: 200 },
    );
  }
  const stops = Object.values(stat.stops)
    .map((s) => ({
      id: s.stopId,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  return NextResponse.json({ stops, count: stops.length });
}

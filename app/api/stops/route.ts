import { NextResponse } from "next/server";
import { getStaticGtfs } from "@/app/lib/staticGtfs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// バス停検索・選択用の停留所リスト。GTFS の stop はのりば (ポール) 単位で、
// 同じ名前の停留所が複数件 (0952_00, 0952_01, ...) 存在して利用者には
// 区別がつかないため、名前でグルーピングして 1 エントリに全ポール ID を持たせる。
// 接近判定側 (/api/approach) が全ポールを対象に「最初に到達するのりば」を選ぶ。
export async function GET() {
  const stat = await getStaticGtfs();
  if (!stat) {
    return NextResponse.json(
      { stops: [], error: "static GTFS unavailable" },
      { status: 200 },
    );
  }

  const byName = new Map<
    string,
    { ids: string[]; latSum: number; lngSum: number; coordCount: number }
  >();
  for (const s of Object.values(stat.stops)) {
    let g = byName.get(s.name);
    if (!g) {
      g = { ids: [], latSum: 0, lngSum: 0, coordCount: 0 };
      byName.set(s.name, g);
    }
    g.ids.push(s.stopId);
    if (s.lat !== undefined && s.lng !== undefined) {
      g.latSum += s.lat;
      g.lngSum += s.lng;
      g.coordCount += 1;
    }
  }

  const stops = Array.from(byName.entries())
    .map(([name, g]) => ({
      name,
      ids: g.ids.sort(),
      lat: g.coordCount > 0 ? g.latSum / g.coordCount : undefined,
      lng: g.coordCount > 0 ? g.lngSum / g.coordCount : undefined,
      poleCount: g.ids.length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  return NextResponse.json({ stops, count: stops.length });
}

import { NextResponse } from "next/server";
import { buildDelayByTrip, fetchKeioBusFeeds } from "@/app/lib/gtfsrt";
import type { OdptBus } from "@/app/types/odpt";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { vehicles, tripUpdates } = await fetchKeioBusFeeds();
    const delayByTrip = buildDelayByTrip(tripUpdates);

    const buses: OdptBus[] = [];
    for (const ent of vehicles.entity) {
      const v = ent.vehicle;
      const pos = v?.position;
      if (!v || !pos) continue;
      if (pos.latitude === undefined || pos.latitude === null) continue;
      if (pos.longitude === undefined || pos.longitude === null) continue;

      const tripId = v.trip?.tripId ?? undefined;
      const routeId = v.trip?.routeId ?? undefined;
      const id = v.vehicle?.id || ent.id || `${pos.latitude},${pos.longitude}`;
      const tsRaw = v.timestamp;
      const tsNum =
        tsRaw && typeof tsRaw === "object" && "toNumber" in tsRaw
          ? (tsRaw as { toNumber: () => number }).toNumber()
          : Number(tsRaw ?? 0);

      const delay = tripId !== undefined ? delayByTrip[tripId] : undefined;

      buses.push({
        "@id": id,
        "@type": "odpt:Bus",
        "dc:date": tsNum
          ? new Date(tsNum * 1000).toISOString()
          : new Date().toISOString(),
        "odpt:operator": "odpt.Operator:KeioBus",
        "odpt:busroutePattern": routeId,
        "odpt:toBusstopPole": v.stopId ?? undefined,
        "geo:lat": pos.latitude,
        "geo:long": pos.longitude,
        "odpt:azimuth":
          pos.bearing !== null && pos.bearing !== undefined
            ? pos.bearing
            : undefined,
        "odpt:speed":
          pos.speed !== null && pos.speed !== undefined
            ? Math.round(pos.speed * 3.6)
            : undefined,
        "odpt:delay": delay,
        "odpt:vehicleNumber": v.vehicle?.label || v.vehicle?.id || undefined,
      });
    }

    return NextResponse.json({
      buses,
      fetchedAt: new Date().toISOString(),
      vehicleCount: vehicles.entity.length,
      tripUpdateCount: tripUpdates?.entity.length ?? 0,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

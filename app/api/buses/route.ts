import { NextResponse } from "next/server";
import { buildTripInfo, fetchKeioBusFeeds } from "@/app/lib/gtfsrt";
import { getStaticGtfsSync } from "@/app/lib/staticGtfs";
import type {
  AgencyEntry,
  OdptBus,
  OdptBusroutePattern,
} from "@/app/types/odpt";

type StopEntry = { title: string; lat?: number; lng?: number };

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { vehicles, tripUpdates } = await fetchKeioBusFeeds();
    const staticSnapshot = getStaticGtfsSync();
    const stat = staticSnapshot.data;
    const staticError = staticSnapshot.error;
    const staticLoading = staticSnapshot.loading;

    const tripInfo = buildTripInfo(tripUpdates);

    const buses: OdptBus[] = [];
    const usedRouteIds = new Set<string>();
    const usedStopIds = new Set<string>();

    for (const ent of vehicles.entity) {
      const v = ent.vehicle;
      const pos = v?.position;
      if (!v || !pos) continue;
      if (pos.latitude === undefined || pos.latitude === null) continue;
      if (pos.longitude === undefined || pos.longitude === null) continue;

      const tripId = v.trip?.tripId ?? undefined;
      const rtTrip = tripId !== undefined ? tripInfo[tripId] : undefined;
      const staticTrip =
        stat && tripId !== undefined ? stat.trips[tripId] : undefined;

      const routeId =
        v.trip?.routeId || rtTrip?.routeId || staticTrip?.routeId || undefined;
      const nextStopId =
        v.stopId || rtTrip?.nextStopId || undefined;

      if (routeId) usedRouteIds.add(routeId);
      if (nextStopId) usedStopIds.add(nextStopId);

      const id = v.vehicle?.id || ent.id || `${pos.latitude},${pos.longitude}`;
      const tsRaw = v.timestamp;
      const tsNum =
        tsRaw && typeof tsRaw === "object" && "toNumber" in tsRaw
          ? (tsRaw as { toNumber: () => number }).toNumber()
          : Number(tsRaw ?? 0);

      buses.push({
        "@id": id,
        "@type": "odpt:Bus",
        "dc:date": tsNum
          ? new Date(tsNum * 1000).toISOString()
          : new Date().toISOString(),
        "odpt:operator": "odpt.Operator:KeioBus",
        "odpt:busroutePattern": routeId,
        "odpt:toBusstopPole": nextStopId,
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
        "odpt:delay": rtTrip?.delay,
        "odpt:vehicleNumber": v.vehicle?.label || v.vehicle?.id || undefined,
      });
    }

    const patternMap: Record<string, OdptBusroutePattern> = {};
    const stopMap: Record<string, StopEntry> = {};
    const agencyMap: Record<string, AgencyEntry> = {};

    if (stat) {
      usedRouteIds.forEach((rid) => {
        const r = stat.routes[rid];
        if (!r) return;
        const title = r.shortName
          ? r.longName
            ? `${r.shortName} ${r.longName}`
            : r.shortName
          : r.longName || rid;
        patternMap[rid] = {
          "@id": rid,
          "@type": "odpt:BusroutePattern",
          "owl:sameAs": rid,
          "odpt:operator": "odpt.Operator:KeioBus",
          "dc:title": title,
          agencyId: r.agencyId,
        };
        if (r.agencyId && stat.agencies[r.agencyId]) {
          agencyMap[r.agencyId] = { name: stat.agencies[r.agencyId].name };
        }
      });
      usedStopIds.forEach((sid) => {
        const s = stat.stops[sid];
        if (!s) return;
        stopMap[sid] = { title: s.name, lat: s.lat, lng: s.lng };
      });
    }

    return NextResponse.json({
      buses,
      patternMap,
      stopMap,
      agencyMap,
      fetchedAt: new Date().toISOString(),
      vehicleCount: vehicles.entity.length,
      tripUpdateCount: tripUpdates?.entity.length ?? 0,
      staticAvailable: stat !== null,
      staticLoading,
      staticError,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

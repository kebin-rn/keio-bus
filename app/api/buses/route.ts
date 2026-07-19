import { NextResponse } from "next/server";
import { buildTripInfo, fetchKeioBusFeeds } from "@/app/lib/gtfsrt";
import { getCachedStaticGtfs, getStaticGtfs } from "@/app/lib/staticGtfs";
import {
  getHachikoVehicleNumbers,
  HACHIKO_OFFICE_NAME,
  HACHIKO_ROUTE_ID,
  HACHIKO_ROUTE_TITLE,
} from "@/app/lib/hachiko";
import type {
  OdptBus,
  OdptBusroutePattern,
  OfficeEntry,
} from "@/app/types/odpt";

type StopEntry = { title: string; lat?: number; lng?: number };

export const dynamic = "force-dynamic";
// 初回(コールド)リクエストでは有効な版日付の探索 + 静的GTFS(約6MB)の
// ダウンロード/展開が走るため余裕を持たせる
export const maxDuration = 60;

export async function GET() {
  try {
    const { vehicles, tripUpdates } = await fetchKeioBusFeeds();
    const stat = await getStaticGtfs();
    const { error: staticError } = getCachedStaticGtfs();

    const tripInfo = buildTripInfo(tripUpdates);
    const hachikoNumbers = getHachikoVehicleNumbers();
    // ハチ公バスは中野営業所の受託。officeId は版によって変わり得るため
    // ID 直書きではなく営業所名から引く
    const hachikoOfficeId = stat
      ? Object.values(stat.offices).find(
          (o) => o.name === HACHIKO_OFFICE_NAME,
        )?.officeId
      : undefined;
    let hachikoActive = false;

    const buses: OdptBus[] = [];
    const usedRouteIds = new Set<string>();
    const usedStopIds = new Set<string>();
    const usedOfficeIds = new Set<string>();

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

      const vehicleNumber = v.vehicle?.label || v.vehicle?.id || undefined;
      // ハチ公バスの系統情報は ODPT に無いため、車番一致で系統を差し替える
      const isHachiko =
        vehicleNumber !== undefined && hachikoNumbers.has(vehicleNumber);

      const routeId = isHachiko
        ? HACHIKO_ROUTE_ID
        : v.trip?.routeId || rtTrip?.routeId || staticTrip?.routeId || undefined;
      const nextStopId = isHachiko
        ? undefined // 停留所情報は当面対象外
        : v.stopId || rtTrip?.nextStopId || undefined;
      const officeId = isHachiko
        ? (staticTrip?.officeId ?? hachikoOfficeId)
        : staticTrip?.officeId;

      if (isHachiko) hachikoActive = true;
      if (routeId && !isHachiko) usedRouteIds.add(routeId);
      if (nextStopId) usedStopIds.add(nextStopId);
      if (officeId) usedOfficeIds.add(officeId);

      const id = v.vehicle?.id || ent.id || `${pos.latitude},${pos.longitude}`;
      const tsNum = Number(v.timestamp ?? 0);

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
        "odpt:vehicleNumber": vehicleNumber,
        officeId,
        tripHeadsign: isHachiko ? undefined : staticTrip?.headsign,
      });
    }

    const patternMap: Record<string, OdptBusroutePattern> = {};
    const stopMap: Record<string, StopEntry> = {};
    const officeMap: Record<string, OfficeEntry> = {};

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
        };
      });
      usedStopIds.forEach((sid) => {
        const s = stat.stops[sid];
        if (!s) return;
        stopMap[sid] = { title: s.name, lat: s.lat, lng: s.lng };
      });
      usedOfficeIds.forEach((oid) => {
        const o = stat.offices[oid];
        if (!o) return;
        officeMap[oid] = { name: o.name };
      });
    }

    // ハチ公バスの合成系統。静的 GTFS に存在しないためここで直接足す
    // (静的データが無くても表示名は出せる)
    if (hachikoActive) {
      patternMap[HACHIKO_ROUTE_ID] = {
        "@id": HACHIKO_ROUTE_ID,
        "@type": "odpt:BusroutePattern",
        "owl:sameAs": HACHIKO_ROUTE_ID,
        "odpt:operator": "odpt.Operator:KeioBus",
        "dc:title": HACHIKO_ROUTE_TITLE,
      };
    }

    return NextResponse.json({
      buses,
      patternMap,
      stopMap,
      officeMap,
      fetchedAt: new Date().toISOString(),
      vehicleCount: vehicles.entity.length,
      tripUpdateCount: tripUpdates?.entity.length ?? 0,
      staticAvailable: stat !== null,
      staticSource: stat?.sourceUrl ?? null,
      staticError,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

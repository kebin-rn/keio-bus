import GtfsRealtimeBindings from "gtfs-realtime-bindings";

const VEHICLE_URL =
  "https://api.odpt.org/api/v4/gtfs/realtime/odpt_KeioBus_AllLines_vehicle";
const TRIP_UPDATE_URL =
  "https://api.odpt.org/api/v4/gtfs/realtime/odpt_KeioBus_AllLines_trip_update";

type FeedMessage = GtfsRealtimeBindings.transit_realtime.FeedMessage;

async function fetchFeed(url: string): Promise<FeedMessage> {
  const key = process.env.ODPT_CONSUMER_KEY;
  if (!key) throw new Error("ODPT_CONSUMER_KEY is not set");

  const fullUrl = `${url}?acl:consumerKey=${encodeURIComponent(key)}`;
  const res = await fetch(fullUrl, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GTFS-RT ${res.status}: ${body.slice(0, 200)}`);
  }
  const buf = await res.arrayBuffer();
  return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
    new Uint8Array(buf),
  );
}

export async function fetchKeioBusFeeds(): Promise<{
  vehicles: FeedMessage;
  tripUpdates: FeedMessage | null;
}> {
  const [vehicles, tripUpdates] = await Promise.all([
    fetchFeed(VEHICLE_URL),
    fetchFeed(TRIP_UPDATE_URL).catch(() => null),
  ]);
  return { vehicles, tripUpdates };
}

export interface TripInfo {
  delay?: number;
  routeId?: string;
  headsign?: string;
  nextStopId?: string;
}

export function buildTripInfo(
  feed: FeedMessage | null,
): Record<string, TripInfo> {
  const map: Record<string, TripInfo> = {};
  if (!feed) return map;
  for (const ent of feed.entity) {
    const tu = ent.tripUpdate;
    if (!tu?.trip?.tripId) continue;

    const info: TripInfo = {};

    if (tu.trip.routeId) info.routeId = tu.trip.routeId;

    let delay: number | null | undefined = tu.delay;
    let nextStopId: string | undefined;
    for (const stu of tu.stopTimeUpdate ?? []) {
      if (
        nextStopId === undefined &&
        stu.stopId !== undefined &&
        stu.stopId !== null
      ) {
        nextStopId = stu.stopId;
      }
      if (delay === undefined || delay === null) {
        if (stu.arrival?.delay !== undefined && stu.arrival.delay !== null) {
          delay = stu.arrival.delay;
        } else if (
          stu.departure?.delay !== undefined &&
          stu.departure.delay !== null
        ) {
          delay = stu.departure.delay;
        }
      }
      if (delay !== undefined && delay !== null && nextStopId !== undefined) break;
    }
    if (delay !== undefined && delay !== null) info.delay = delay;
    if (nextStopId !== undefined) info.nextStopId = nextStopId;

    map[tu.trip.tripId] = info;
  }
  return map;
}

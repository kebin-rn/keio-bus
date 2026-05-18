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

export function buildDelayByTrip(
  feed: FeedMessage | null,
): Record<string, number> {
  const map: Record<string, number> = {};
  if (!feed) return map;
  for (const ent of feed.entity) {
    const tu = ent.tripUpdate;
    if (!tu?.trip?.tripId) continue;

    let delay: number | null | undefined = tu.delay;
    if (delay === undefined || delay === null) {
      for (const stu of tu.stopTimeUpdate ?? []) {
        if (stu.arrival?.delay !== undefined && stu.arrival.delay !== null) {
          delay = stu.arrival.delay;
          break;
        }
        if (stu.departure?.delay !== undefined && stu.departure.delay !== null) {
          delay = stu.departure.delay;
          break;
        }
      }
    }
    if (delay !== undefined && delay !== null) {
      map[tu.trip.tripId] = delay;
    }
  }
  return map;
}

import protobuf from "protobufjs";
import { GTFS_REALTIME_PROTO } from "./gtfs-realtime-proto";

const VEHICLE_URL =
  "https://api.odpt.org/api/v4/gtfs/realtime/odpt_KeioBus_AllLines_vehicle";
const TRIP_UPDATE_URL =
  "https://api.odpt.org/api/v4/gtfs/realtime/odpt_KeioBus_AllLines_trip_update";

// プロト定義は一度だけ parse して FeedMessage 型をキャッシュ
let feedMessageType: protobuf.Type | null = null;
function getFeedMessageType(): protobuf.Type {
  if (!feedMessageType) {
    const root = protobuf.parse(GTFS_REALTIME_PROTO).root;
    feedMessageType = root.lookupType("transit_realtime.FeedMessage");
  }
  return feedMessageType;
}

// 利用側に最小限の型を提供。protobufjs の toObject() 出力 (camelCase) と一致させる。
export interface Position {
  latitude: number;
  longitude: number;
  bearing?: number;
  speed?: number;
}

export interface TripDescriptor {
  tripId?: string;
  routeId?: string;
  directionId?: number;
}

export interface VehicleDescriptor {
  id?: string;
  label?: string;
}

export interface StopTimeUpdate {
  stopSequence?: number;
  stopId?: string;
  arrival?: { delay?: number };
  departure?: { delay?: number };
}

export interface VehiclePosition {
  trip?: TripDescriptor;
  vehicle?: VehicleDescriptor;
  position?: Position;
  currentStopSequence?: number;
  stopId?: string;
  currentStatus?: number;
  timestamp?: number;
  occupancyStatus?: number;
}

export interface TripUpdate {
  trip: TripDescriptor;
  vehicle?: VehicleDescriptor;
  stopTimeUpdate?: StopTimeUpdate[];
  delay?: number;
  timestamp?: number;
}

export interface FeedEntity {
  id: string;
  vehicle?: VehiclePosition;
  tripUpdate?: TripUpdate;
}

export interface FeedMessage {
  entity: FeedEntity[];
}

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
  const type = getFeedMessageType();
  const msg = type.decode(new Uint8Array(buf));
  // toObject で素の JS オブジェクトに変換。longs: Number で uint64(timestamp 等)
  // を Long ラッパーではなく Number 化 (Unix秒なので 2^53 余裕で収まる)
  return type.toObject(msg, {
    longs: Number,
    enums: Number,
    defaults: false,
    arrays: true,
    objects: false,
  }) as FeedMessage;
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

    let delay: number | undefined = tu.delay;
    let nextStopId: string | undefined;
    for (const stu of tu.stopTimeUpdate ?? []) {
      if (nextStopId === undefined && stu.stopId !== undefined) {
        nextStopId = stu.stopId;
      }
      if (delay === undefined) {
        if (stu.arrival?.delay !== undefined) {
          delay = stu.arrival.delay;
        } else if (stu.departure?.delay !== undefined) {
          delay = stu.departure.delay;
        }
      }
      if (delay !== undefined && nextStopId !== undefined) break;
    }
    if (delay !== undefined) info.delay = delay;
    if (nextStopId !== undefined) info.nextStopId = nextStopId;

    map[tu.trip.tripId] = info;
  }
  return map;
}

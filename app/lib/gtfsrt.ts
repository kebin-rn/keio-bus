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

// ODPT の GTFS-RT エンドポイントは時折 10 秒以上ハングする (Vercel の
// Functions ログで確認)。素の fetch だとそのままリクエスト全体が 500 に
// なるため、3 層で防御する:
//   1. fetch に明示タイムアウト
//   2. 同一インスタンス内の同時リクエストは 1 本の上流フェッチに合流させ、
//      直後のリクエストは短期キャッシュで返す (上流への請求回数も減る)
//   3. 上流障害時は直近の取得結果を stale 付きで返し、画面を落とさない
const FETCH_TIMEOUT_MS = 8_000;
const FRESH_TTL_MS = 5_000; // この間隔以内の連続リクエストはキャッシュで返す
const STALE_MAX_MS = 120_000; // 障害時に古いデータを返してよい上限

interface FeedSnapshot {
  vehicles: FeedMessage;
  tripUpdates: FeedMessage | null;
  fetchedAt: number; // 上流から取得できた時刻 (epoch ms)
}

export interface KeioBusFeeds extends FeedSnapshot {
  stale: boolean; // 上流障害でキャッシュを返している場合 true
}

let feedCache: FeedSnapshot | null = null;
let feedInflight: Promise<FeedSnapshot> | null = null;

async function fetchFeed(url: string): Promise<FeedMessage> {
  const key = process.env.ODPT_CONSUMER_KEY;
  if (!key) throw new Error("ODPT_CONSUMER_KEY is not set");

  const fullUrl = `${url}?acl:consumerKey=${encodeURIComponent(key)}`;
  const name = url.slice(url.lastIndexOf("/") + 1);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  // タイマーはヘッダ受信だけでなくボディ読み取り (arrayBuffer) 完了まで
  // 生かしておく。ヘッダ到達後にボディが止まるハングは実際に起きるが、
  // abort シグナルは undici のボディ読み取りにも効くため、この形なら
  // どの段階の停止でも FETCH_TIMEOUT_MS で確実に打ち切れる。
  try {
    let res: Response;
    try {
      res = await fetch(fullUrl, {
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (e) {
      if (controller.signal.aborted) {
        throw new Error(`GTFS-RT ${name} timeout (${FETCH_TIMEOUT_MS}ms)`);
      }
      throw new Error(
        `GTFS-RT ${name} fetch error: ${e instanceof Error ? e.message : e}`,
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GTFS-RT ${res.status}: ${body.slice(0, 200)}`);
    }
    let buf: ArrayBuffer;
    try {
      buf = await res.arrayBuffer();
    } catch (e) {
      if (controller.signal.aborted) {
        throw new Error(`GTFS-RT ${name} body timeout (${FETCH_TIMEOUT_MS}ms)`);
      }
      throw new Error(
        `GTFS-RT ${name} body read error: ${e instanceof Error ? e.message : e}`,
      );
    }
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
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBothFeeds(): Promise<FeedSnapshot> {
  // trip_update は無くても地図表示は成立するため失敗を許容する
  const [vehicles, tripUpdates] = await Promise.all([
    fetchFeed(VEHICLE_URL),
    fetchFeed(TRIP_UPDATE_URL).catch(() => null),
  ]);
  const snapshot: FeedSnapshot = {
    vehicles,
    tripUpdates,
    fetchedAt: Date.now(),
  };
  // trip_update が欠けた部分スナップショットは今回のリクエストにだけ使い、
  // キャッシュには載せない。フレッシュ扱いでキャッシュすると、以後 5 秒間
  // (障害時は最大 120 秒) の全リクエストが「遅延・接近情報なし」に汚染される。
  // キャッシュに残る直近の完全なスナップショットの方がフォールバックとして適切。
  if (tripUpdates !== null) {
    feedCache = snapshot;
  }
  return snapshot;
}

export async function fetchKeioBusFeeds(): Promise<KeioBusFeeds> {
  const now = Date.now();
  if (feedCache && now - feedCache.fetchedAt < FRESH_TTL_MS) {
    return { ...feedCache, stale: false };
  }
  if (!feedInflight) {
    feedInflight = fetchBothFeeds().finally(() => {
      feedInflight = null;
    });
  }
  try {
    const snapshot = await feedInflight;
    return { ...snapshot, stale: false };
  } catch (e) {
    // 上流障害: 直近スナップショットが十分新しければそれで凌ぐ。
    // 経過時間はフェッチ待ちの分を含めた現在時刻で判定する
    if (feedCache && Date.now() - feedCache.fetchedAt < STALE_MAX_MS) {
      return { ...feedCache, stale: true };
    }
    throw e;
  }
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

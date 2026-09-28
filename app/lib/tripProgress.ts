// 車両の進行状況を、接近ボード (/api/approach)・便詳細 (/api/trip)・地図
// (/api/buses) で同じ基準で扱うための共通処理。「あと何停留所」「到着予想」
// 「遅延表示」が画面ごとに食い違わないよう、判定はここに一本化する。

export interface TripProgress {
  firstSeq: number;
  // 停留所列の上での現在位置。current_stop_sequence=0 (便の開始前) は
  // 停留所列に存在しないため始発の seq に寄せる
  effectiveSeq: number;
  // 始発をまだ発車していない (始発へ向かっている / 始発で待機中 / 開始前)
  beforeDeparture: boolean;
  // effectiveSeq の停留所に停車中か (false なら接近中)
  stopped: boolean;
  // 到着予想・遅延表示に使う遅延 (秒)
  effectiveDelay: number;
}

const STOPPED_AT = 1;
// 始発に「停車中」と報告されていても、ここまで離れていれば実際は発車済み
const LEFT_ORIGIN_DISTANCE_M = 150;

export interface VehicleLike {
  currentStopSequence?: number;
  currentStatus?: number;
  position?: { latitude: number; longitude: number };
}

export interface StopRef {
  stopSequence?: number;
  stopId?: string;
}

export function tripProgress(
  veh: VehicleLike,
  stops: StopRef[],
  delay: number | undefined,
  stopCoords: (stopId: string) => { lat?: number; lng?: number } | undefined,
): TripProgress {
  const seqStops = stops
    .filter(
      (s): s is { stopSequence: number; stopId?: string } =>
        s.stopSequence !== undefined,
    )
    .sort((a, b) => a.stopSequence - b.stopSequence);
  const firstSeq = seqStops.length ? seqStops[0].stopSequence : 1;
  const cur = veh.currentStopSequence ?? firstSeq;
  let effectiveSeq = Math.max(cur, firstSeq);
  let stopped = veh.currentStatus === STOPPED_AT;
  let beforeDeparture = cur <= firstSeq;

  // フィードが始発を出た便を「始発に停車中」のまま送ってくることがある
  // (実測: 始発から 205m、次の停留所まで 26m の地点で 3 分間 STOPPED_AT seq1)。
  // 位置が始発から十分離れ、しかも 2 番目の停留所の方が近ければ発車済みとし、
  // 2 番目の停留所に接近中として扱う。始発へ向かっている (INCOMING_AT) 便や、
  // 始発近くの待機場にいる便は対象外。
  if (stopped && cur === firstSeq && veh.position && seqStops.length >= 2) {
    const origin = seqStops[0].stopId ? stopCoords(seqStops[0].stopId) : undefined;
    const second = seqStops[1].stopId ? stopCoords(seqStops[1].stopId) : undefined;
    if (origin?.lat !== undefined && origin.lng !== undefined &&
        second?.lat !== undefined && second.lng !== undefined) {
      const { latitude, longitude } = veh.position;
      const dOrigin = distanceM(latitude, longitude, origin.lat, origin.lng);
      const dSecond = distanceM(latitude, longitude, second.lat, second.lng);
      if (dOrigin > LEFT_ORIGIN_DISTANCE_M && dSecond < dOrigin) {
        effectiveSeq = seqStops[1].stopSequence;
        stopped = false;
        beforeDeparture = false;
      }
    }
  }

  return {
    firstSeq,
    effectiveSeq,
    beforeDeparture,
    stopped,
    // 始発で発車を待っている間、フィードの遅延は「始発に早く着いた分」に
    // なり -20 分のような値が出る (実際には定刻まで待機してから発車する)。
    // これを下流に足すと、まだ発車していない便の予想が過去の時刻になるため、
    // 発車前に限り早着分は 0 とみなす。遅れ (正の値) はそのまま使う。
    effectiveDelay: beforeDeparture ? Math.max(delay ?? 0, 0) : (delay ?? 0),
  };
}

// 2 点間の距離 (m)。停留所間隔程度の短距離なので球面近似で十分
export function distanceM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

import { minutesFromNowJst } from "./format";

// 停留所ごとの「まもなく / 約N分後」と、バスがいる停留所の状態表示。
// 接近ボードの便詳細シートと地図の経路表示で同じ表記にするための共通処理。

// 接近ボードの「まもなく」と同じ基準 (車載器→ODPT の転送遅延を見込んで 1 停留所前から)
export const IMMINENT_STOPS = 1;

// これから通る停留所 (バスがいる停留所は除く) の相対表示
export function relativeArrivalLabel({
  stopsAhead,
  beforeDeparture,
  predictedSec,
  nowMs,
}: {
  stopsAhead: number; // バスの現在位置から何停留所先か
  beforeDeparture: boolean;
  predictedSec?: number;
  nowMs?: number;
}): string | null {
  // 始発で発車を待っている間は、停留所数が近くても発車まで時間があるため
  // 「まもなく」は使わない
  if (!beforeDeparture && stopsAhead <= IMMINENT_STOPS) return "まもなく";
  if (predictedSec === undefined) return null;
  const mins = minutesFromNowJst(predictedSec, nowMs);
  // 予想時刻を過ぎている場合は分数を出さない (時刻のみ表示)
  return mins >= 1 ? `約${mins}分後` : null;
}

// バスがいる停留所の状態
export function busStatusText(beforeDeparture: boolean, stopped: boolean): string {
  if (beforeDeparture) return "発車前";
  return stopped ? "停車中" : "接近中";
}

// バスの現在位置の文 (便詳細シートの「🚌 現在」と地図の情報カードで共通)
export function busPositionText(
  name: string | null,
  beforeDeparture: boolean,
  stopped: boolean,
): string {
  const n = name ?? "停留所名不明";
  if (beforeDeparture) return stopped ? `始発 ${n} で発車待ち` : `始発 ${n} に向かっています`;
  return stopped ? `${n} に停車中` : `${n} に接近中`;
}

// 便の停留所一覧の 1 行 (停留所ごとの通過状況と到着予想)
export interface TimelineStop {
  seq: number;
  stopId: string;
  name: string | null; // 静的 GTFS に無い停留所は null (画面側で「停留所名不明」)
  lat?: number;
  lng?: number;
  scheduledSec?: number; // 定刻 (0時起点の秒、24時超えあり)
  predictedSec?: number; // 到着予想 = 定刻 + 便の現在の遅延 (未通過の停留所のみ)
  state: "passed" | "current" | "upcoming";
}

// 停留所列とバスの現在位置・遅延から、停留所ごとの状況と到着予想を求める。
// /api/trip と同じ規則 (現在位置より前は通過済み、未通過は 定刻 + 遅延)。
// 地図の情報カードは /api/buses のバスの位置・遅延を使い、地図上の経路の
// 通過済み/これからの塗り分けや停留所の時刻と揃える
export function deriveTimeline(
  stops: readonly {
    seq: number;
    stopId: string;
    name: string | null;
    lat?: number;
    lng?: number;
    scheduledSec?: number;
  }[],
  currentSeq: number,
  delaySec: number,
): TimelineStop[] {
  return stops.map((s) => {
    const state: TimelineStop["state"] =
      s.seq < currentSeq ? "passed" : s.seq === currentSeq ? "current" : "upcoming";
    return {
      seq: s.seq,
      stopId: s.stopId,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      scheduledSec: s.scheduledSec,
      predictedSec:
        state !== "passed" && s.scheduledSec !== undefined
          ? s.scheduledSec + delaySec
          : undefined,
      state,
    };
  });
}

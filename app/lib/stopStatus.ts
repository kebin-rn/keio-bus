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

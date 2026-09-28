// 車両の進行状況を、接近ボード (/api/approach) と便詳細 (/api/trip) で
// 同じ基準で扱うための共通処理。両者の「あと何停留所」「到着予想」が
// 食い違わないよう、判定はここに一本化する。

export interface TripProgress {
  firstSeq: number;
  // 停留所列の上での現在位置。current_stop_sequence=0 (便の開始前) は
  // 停留所列に存在しないため始発の seq に寄せる
  effectiveSeq: number;
  // 始発をまだ発車していない (始発へ向かっている / 始発で待機中 / 開始前)
  beforeDeparture: boolean;
  // 到着予想・遅延表示に使う遅延 (秒)
  effectiveDelay: number;
}

export function tripProgress(
  currentStopSequence: number,
  stopSequences: number[],
  delay: number | undefined,
): TripProgress {
  const firstSeq = stopSequences.length ? Math.min(...stopSequences) : 1;
  const beforeDeparture = currentStopSequence <= firstSeq;
  return {
    firstSeq,
    effectiveSeq: Math.max(currentStopSequence, firstSeq),
    beforeDeparture,
    // 始発で発車を待っている間、フィードの遅延は「始発に早く着いた分」に
    // なり -20 分のような値が出る (実際には定刻まで待機してから発車する)。
    // これを下流に足すと、まだ発車していない便の予想が過去の時刻になるため、
    // 発車前に限り早着分は 0 とみなす。遅れ (正の値) はそのまま使う。
    effectiveDelay: beforeDeparture ? Math.max(delay ?? 0, 0) : (delay ?? 0),
  };
}

export interface DelayInfo {
  label: string;
  level: "early" | "ontime" | "minor" | "major" | "unknown";
  color: string;
}

export function classifyDelay(delaySec: number | undefined): DelayInfo {
  if (delaySec === undefined || delaySec === null || Number.isNaN(delaySec)) {
    return { label: "情報なし", level: "unknown", color: "#64748b" };
  }
  if (delaySec < -30) {
    return { label: `${Math.round(-delaySec / 60)}分早発`, level: "early", color: "#0ea5e9" };
  }
  if (delaySec <= 60) {
    return { label: "定時", level: "ontime", color: "#22c55e" };
  }
  if (delaySec <= 300) {
    return { label: `${Math.round(delaySec / 60)}分遅れ`, level: "minor", color: "#eab308" };
  }
  return { label: `${Math.round(delaySec / 60)}分遅れ`, level: "major", color: "#ef4444" };
}

export function shortenStopId(id: string | undefined): string {
  if (!id) return "—";
  const idx = id.lastIndexOf(":");
  if (idx === -1) return id;
  const tail = id.slice(idx + 1);
  return decodeURIComponent(tail).replace(/\./g, " ");
}

export function shortenPatternId(id: string | undefined): string {
  if (!id) return "—";
  const idx = id.lastIndexOf(":");
  if (idx === -1) return id;
  return id.slice(idx + 1);
}

// 0時起点の秒（24時超え可）を JST の HH:MM に整形
export function formatEtaSec(sec: number | undefined): string | null {
  if (sec === undefined || sec === null || Number.isNaN(sec)) return null;
  const s = ((Math.round(sec) % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// 0時起点の秒 (GTFS の時刻、24時超えあり) が現在 (JST) から何分後かを返す。
// 深夜の便は 24:10 = 87000 秒のように表記されるので、差を ±12 時間の範囲に
// 正規化して日付またぎを吸収する。
export function minutesFromNowJst(sec: number, nowMs: number = Date.now()): number {
  const nowSec = (nowMs / 1000 + 9 * 3600) % 86400;
  let diff = (((sec - nowSec) % 86400) + 86400) % 86400;
  if (diff > 43200) diff -= 86400;
  return Math.round(diff / 60);
}

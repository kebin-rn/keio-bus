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

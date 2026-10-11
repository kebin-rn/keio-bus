"use client";

import { formatEtaSec } from "../lib/format";
import { relativeArrivalLabel, type TimelineStop } from "../lib/stopStatus";

// 便の停留所一覧の 1 行 (時刻・路線図の縦線とマーカー・停留所名・状況)。
// 接近案内の便詳細シート (暗い背景) と、PC 版地図の情報カード (白い背景) で使う。
// 地図関連のモジュールは読み込まない (接近案内のページに地図のライブラリが入らないように)

const TOKENS = {
  // 便詳細シート
  sheet: {
    columns: "64px 24px 1fr",
    padding: "0 16px",
    minHeight: 44,
    size: 14,
    main: "#f1f5f9",
    secondary: "#94a3b8",
    line: "#334155",
    passedLine: "#475569",
    passedText: "#475569",
    dotFill: "#0f172a",
    dotBorder: "#94a3b8",
    busStatus: "#fbbf24",
  },
  // PC 版地図の情報カード
  light: {
    columns: "64px 20px 1fr",
    padding: "0 10px",
    minHeight: 40,
    size: 13,
    main: "#0f172a",
    secondary: "#475569",
    line: "#cbd5e1",
    passedLine: "#94a3b8",
    passedText: "#64748b",
    dotFill: "#ffffff",
    dotBorder: "#64748b",
    busStatus: "#b45309",
  },
};

// 地図で選んでいる停留所の行 (地図の経路の青と同じ)
const FOCUS_COLOR = "#1a73e8";

export default function TripStopRow({
  stop,
  isFirst,
  isLast,
  highlighted,
  live,
  stopsAhead,
  beforeDeparture,
  busStatusText,
  variant = "sheet",
  focused = false,
  interactive,
}: {
  stop: TimelineStop;
  isFirst: boolean;
  isLast: boolean;
  highlighted: boolean;
  live: boolean; // 運行中の最新情報か (終了後は現在位置・カウントダウンを出さない)
  stopsAhead: number; // バスの現在位置から何停留所先か
  beforeDeparture: boolean;
  busStatusText: string;
  variant?: "sheet" | "light";
  focused?: boolean; // 地図で選んでいる停留所
  // 行を押して地図でその停留所を表示する (PC 版の地図の情報カード)
  interactive?: { onSelect: () => void; tabIndex: 0 | -1 };
}) {
  // 選んでいる行 (薄い青の地) では、小さい灰色・茶色の文字を濃くしてコントラストを保つ
  const tinted = variant === "light" && focused;
  const t = tinted
    ? { ...TOKENS.light, passedText: "#475569", busStatus: "#92400e" }
    : TOKENS[variant];
  const noteColor = tinted ? "#475569" : "#64748b";
  const passed = stop.state === "passed";
  const busHere = live && stop.state === "current";
  const scheduled = formatEtaSec(stop.scheduledSec);
  const predicted = formatEtaSec(stop.predictedSec);
  const lineColor = t.line;

  // 未通過の停留所の相対表示 (地図の経路表示と共通の判定)
  const relative =
    live && !passed && !busHere
      ? relativeArrivalLabel({
          stopsAhead,
          beforeDeparture,
          predictedSec: stop.predictedSec,
        })
      : null;

  return (
    <div
      data-state={stop.state}
      {...(interactive
        ? {
            "data-seq": stop.seq,
            role: "button",
            tabIndex: interactive.tabIndex,
            "aria-pressed": focused,
            "aria-label": stopRowLabel(stop, { live, busHere, scheduled, predicted, relative, busStatusText }),
            title: "地図でこの停留所を表示",
            onClick: interactive.onSelect,
          }
        : {})}
      style={{
        display: "grid",
        gridTemplateColumns: t.columns,
        alignItems: "stretch",
        minHeight: t.minHeight,
        padding: t.padding,
        background: highlighted
          ? "rgba(245, 158, 11, 0.12)"
          : focused
            ? "rgba(26, 115, 232, 0.10)"
            : "transparent",
        borderLeft: highlighted
          ? "3px solid #f59e0b"
          : focused
            ? `3px solid ${FOCUS_COLOR}`
            : "3px solid transparent",
        ...(interactive ? { cursor: "pointer" } : {}),
      }}
    >
      {/* 時刻列 */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-end",
          paddingRight: 8,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {passed || !live ? (
          <span style={{ fontSize: 12, color: passed ? t.passedText : t.secondary }}>
            {scheduled ?? "—"}
          </span>
        ) : (
          <>
            <span style={{ fontSize: t.size, fontWeight: 700, color: t.main }}>
              {predicted ?? "—"}
            </span>
            {scheduled && predicted && scheduled !== predicted && (
              <span style={{ fontSize: 10, color: noteColor }}>定刻 {scheduled}</span>
            )}
          </>
        )}
      </div>

      {/* 路線図の縦線とマーカー */}
      <div style={{ position: "relative" }}>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: isFirst ? "50%" : 0,
            bottom: isLast ? "50%" : 0,
            width: 2,
            transform: "translateX(-50%)",
            background: passed ? t.passedLine : lineColor,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: busHere ? 20 : highlighted ? 14 : 10,
            height: busHere ? 20 : highlighted ? 14 : 10,
            borderRadius: "50%",
            background: busHere
              ? "#f59e0b"
              : passed
                ? t.passedLine
                : highlighted
                  ? "#f59e0b"
                  : t.dotFill,
            border: busHere || passed ? "none" : `2px solid ${highlighted ? "#f59e0b" : t.dotBorder}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
          }}
        >
          {busHere ? "🚌" : null}
        </div>
      </div>

      {/* 停留所名 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          paddingLeft: 8,
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontSize: t.size,
            fontWeight: busHere || highlighted ? 700 : 400,
            color: passed || stop.name === null ? t.passedText : t.main,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {stop.name ?? "停留所名不明"}
        </span>
        <span style={{ flexShrink: 0, display: "flex", gap: 6, alignItems: "center" }}>
          {highlighted && (
            <span
              style={{
                fontSize: 10,
                padding: "1px 6px",
                borderRadius: 999,
                background: "#f59e0b",
                color: "#111827",
                fontWeight: 700,
              }}
            >
              このバス停
            </span>
          )}
          {busHere && (
            <span style={{ fontSize: 11, color: t.busStatus, fontWeight: 600 }}>
              {busStatusText}
            </span>
          )}
          {passed && <span style={{ fontSize: 11, color: t.passedText }}>通過</span>}
          {relative && (
            <span style={{ fontSize: 11, color: t.secondary }}>{relative}</span>
          )}
        </span>
      </div>
    </div>
  );
}

// 押せる行の読み上げ名 (停留所名を先に、見えている情報をそのまま並べる)
function stopRowLabel(
  stop: TimelineStop,
  {
    live,
    busHere,
    scheduled,
    predicted,
    relative,
    busStatusText,
  }: {
    live: boolean;
    busHere: boolean;
    scheduled: string | null;
    predicted: string | null;
    relative: string | null;
    busStatusText: string;
  },
): string {
  const name = stop.name ?? "停留所名不明";
  const parts = [name];
  if (stop.state === "passed") {
    parts.push("通過");
  } else if (!live) {
    if (scheduled) parts.push(`定刻 ${scheduled}`);
  } else if (busHere) {
    if (predicted) parts.push(predicted);
    parts.push(busStatusText);
  } else {
    if (predicted) parts.push(`${predicted} 着予定`);
    if (scheduled && predicted && scheduled !== predicted) parts.push(`定刻 ${scheduled}`);
    if (relative) parts.push(relative);
  }
  parts.push("地図で表示");
  return parts.join("、");
}

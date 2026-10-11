"use client";

import { useState } from "react";
import { ROUTE_COLOR } from "./BusMap";

// 地図の経路表示のオン/オフ (PC 版は画面上部の更新ボタンの左、スマホ版は検索欄の右)。
// 見た目は隣のボタンや入力欄に合わせ、オンの色は地図の経路の線と同じ青にする。
// 絞り込み中を表す水色 (MultiSelect) は使わない (オンは既定の状態のため)
export default function RouteToggle({
  checked,
  onChange,
  style,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  style?: React.CSSProperties;
}) {
  // 保存済みの「オフ」はマウント後に反映される。そのときつまみが滑って見えないよう、
  // 動きは利用者が一度切り替えてから付ける
  const [animate, setAnimate] = useState(false);
  const duration = animate ? "150ms" : "0s";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title="バスを選ぶと、その便の経路と停留所を地図に表示します"
      onClick={() => {
        setAnimate(true);
        onChange(!checked);
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
        height: 34,
        padding: "0 10px",
        background: "#1e293b",
        border: "1px solid #334155",
        borderRadius: 6,
        color: checked ? "#f1f5f9" : "#94a3b8",
        fontSize: 13,
        whiteSpace: "nowrap",
        // 素早い 2 回タップで画面が拡大されないように
        touchAction: "manipulation",
        ...style,
      }}
    >
      <span>経路表示</span>
      <span
        aria-hidden="true"
        style={{
          position: "relative",
          flexShrink: 0,
          width: 32,
          height: 18,
          borderRadius: 999,
          background: checked ? ROUTE_COLOR : "#64748b",
          transition: `background-color ${duration} ease`,
          // Windows のコントラスト テーマ (強制カラー) でも、つまみと地の色を残して
          // オン/オフが見分けられるようにする (つまみにも引き継がれる)
          forcedColorAdjust: "none",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: 2,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: checked ? "#ffffff" : "#e2e8f0",
            boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
            transform: checked ? "translateX(14px)" : "none",
            transition: `transform ${duration} ease, background-color ${duration} ease`,
          }}
        />
      </span>
    </button>
  );
}

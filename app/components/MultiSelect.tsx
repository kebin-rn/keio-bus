"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface MultiSelectOption {
  value: string;
  label: string;
}

// チェックボックス式の複数選択ドロップダウン。
// ネイティブ <select multiple> はモバイルで扱いづらいため自前実装。
// selected が空 = 「すべて」扱い (placeholder を表示)。
export default function MultiSelect({
  ariaLabel,
  placeholder,
  summaryPrefix,
  options,
  selected,
  onChange,
  align = "left",
  containerStyle,
  buttonStyle,
}: {
  ariaLabel: string;
  placeholder: string;
  summaryPrefix: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  align?: "left" | "right";
  containerStyle?: React.CSSProperties;
  buttonStyle?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  // overflow:hidden なページ (100dvh 固定のモバイル地図等) ではパネルが
  // 画面外にはみ出た分がクリップされ最後の選択肢に届かなくなるため、
  // 開く直前にトリガー下の空きを測って高さを決める。
  const [maxHeight, setMaxHeight] = useState(300);
  const rootRef = useRef<HTMLDivElement>(null);

  // 一度でも選択肢に現れた値のラベルを覚えておく。系統のバスが全便終了して
  // options から消えた後も、行に生 ID ではなく元の表示名を出すため。
  const seenLabels = useRef(new Map<string, string>());
  useEffect(() => {
    for (const o of options) seenLabels.current.set(o.value, o.label);
  }, [options]);

  const recalcHeight = useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const available = window.innerHeight - rect.bottom - 16;
    setMaxHeight(Math.max(140, Math.min(300, available)));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("resize", recalcHeight);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", recalcHeight);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, recalcHeight]);

  const toggle = (v: string) => {
    onChange(
      selected.includes(v)
        ? selected.filter((x) => x !== v)
        : [...selected, v],
    );
  };

  // 選択中だが現在の選択肢に無い値 (該当系統のバスが一時的に全便終了した等)。
  // 行として出さないと「解除できない見えないフィルタ」になるため明示する。
  const staleSelected = selected.filter(
    (v) => !options.some((o) => o.value === v),
  );

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ??
          seenLabels.current.get(selected[0]) ??
          `${summaryPrefix}: 1件選択`)
        : `${summaryPrefix}: ${selected.length}件選択`;

  const rowStyle = (checked: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    fontSize: 13,
    color: "#f1f5f9",
    cursor: "pointer",
    borderRadius: 6,
    background: checked ? "#1e293b" : "transparent",
  });

  return (
    <div ref={rootRef} style={{ position: "relative", ...containerStyle }}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          // 開く前に同期で高さを測る (開いた後だと 1 フレーム旧値で描画される)
          if (!open) recalcHeight();
          setOpen((o) => !o);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          width: "100%",
          height: 34,
          padding: "0 8px",
          background: "#1e293b",
          color: selected.length > 0 ? "#7dd3fc" : "#f1f5f9",
          border: `1px solid ${selected.length > 0 ? "#0ea5e9" : "#334155"}`,
          borderRadius: 6,
          fontSize: 13,
          ...buttonStyle,
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {summary}
        </span>
        <span style={{ flexShrink: 0, fontSize: 10, color: "#94a3b8" }}>
          ▼
        </span>
      </button>

      {open && (
        <>
          {/* 透明バックドロップ: パネル外タップを吸収して閉じる。
              これが無いと閉じるためのタップが下の地図やボタンに貫通する */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 55 }}
          />
          <div
            role="listbox"
            aria-label={ariaLabel}
            aria-multiselectable="true"
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              ...(align === "right" ? { right: 0 } : { left: 0 }),
              minWidth: "100%",
              width: "max-content",
              maxWidth: "min(320px, 86vw)",
              maxHeight,
              overflowY: "auto",
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 8,
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              zIndex: 60,
              padding: 4,
            }}
          >
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  color: "#7dd3fc",
                  fontSize: 12,
                  borderRadius: 6,
                }}
              >
                ✕ すべて解除
              </button>
            )}
            {staleSelected.map((v) => (
              <label key={`stale-${v}`} style={rowStyle(true)}>
                <input
                  type="checkbox"
                  checked
                  onChange={() => toggle(v)}
                  style={{ accentColor: "#0ea5e9", flexShrink: 0 }}
                />
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: "#94a3b8",
                  }}
                >
                  {seenLabels.current.get(v) ?? v} (現在運行なし)
                </span>
              </label>
            ))}
            {options.length === 0 && staleSelected.length === 0 && (
              <div
                style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}
              >
                選択肢がありません
              </div>
            )}
            {options.map((o) => {
              const checked = selected.includes(o.value);
              return (
                <label key={o.value} style={rowStyle(checked)}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(o.value)}
                    style={{ accentColor: "#0ea5e9", flexShrink: 0 }}
                  />
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {o.label}
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

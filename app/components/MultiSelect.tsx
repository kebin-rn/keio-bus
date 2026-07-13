"use client";

import { useEffect, useRef, useState } from "react";

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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (v: string) => {
    onChange(
      selected.includes(v)
        ? selected.filter((x) => x !== v)
        : [...selected, v],
    );
  };

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ??
          `${summaryPrefix}: 1件選択`)
        : `${summaryPrefix}: ${selected.length}件選択`;

  return (
    <div ref={rootRef} style={{ position: "relative", ...containerStyle }}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
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
            maxHeight: 300,
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
          {options.length === 0 && (
            <div style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>
              選択肢がありません
            </div>
          )}
          {options.map((o) => {
            const checked = selected.includes(o.value);
            return (
              <label
                key={o.value}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                  color: "#f1f5f9",
                  cursor: "pointer",
                  borderRadius: 6,
                  background: checked ? "#1e293b" : "transparent",
                }}
              >
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
      )}
    </div>
  );
}

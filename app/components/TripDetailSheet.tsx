"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  classifyDelay,
  formatEtaSec,
  minutesFromNowJst,
} from "../lib/format";

const REFRESH_MS = 20_000;
// 接近ボードの「まもなく」と同じ基準 (車載器→ODPT の転送遅延を見込んで 1 停留所前から)
const IMMINENT_STOPS = 1;

interface TripStop {
  seq: number;
  stopId: string;
  name: string | null;
  scheduledSec?: number;
  predictedSec?: number;
  state: "passed" | "current" | "upcoming";
}

interface TripDetail {
  tripId: string;
  routeTitle?: string;
  headsign?: string;
  officeName?: string;
  vehicleNumber?: string;
  delay?: number;
  currentStopSequence: number;
  beforeDeparture: boolean;
  vehicleStatus: "stopped" | "approaching";
}

// 接近ボードで選んだ便の詳細 (全停留所・到着予想) を表示するシート。
// 画面下から出るシートで、PC では幅 560px に収めて中央に寄せる。
export default function TripDetailSheet({
  tripId,
  highlightSeq,
  fallbackTitle,
  onClose,
}: {
  tripId: string;
  highlightSeq?: number; // 利用者が選んでいる停留所に着く行
  fallbackTitle?: string;
  onClose: () => void;
}) {
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [stops, setStops] = useState<TripStop[]>([]);
  const [error, setError] = useState<string | null>(null);
  // 便の運行が終わった (API が 404)。以後は更新を止め、現在位置・カウントダウンを出さない
  const [ended, setEnded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const reqSeq = useRef(0);
  const endedRef = useRef(false);
  // 便がフィードから一瞬だけ消えることがあるため、404 が 2 回続いたら運行終了とみなす
  const notFoundCount = useRef(0);
  const scrolledFor = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    if (endedRef.current) return;
    const my = ++reqSeq.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/trip?id=${encodeURIComponent(tripId)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (my !== reqSeq.current) return;
      if (res.status === 404) {
        notFoundCount.current += 1;
        if (notFoundCount.current >= 2) {
          endedRef.current = true;
          setEnded(true);
          setError(null);
        }
        return;
      }
      notFoundCount.current = 0;
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setTrip(data.trip);
      setStops(data.stops || []);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      if (my !== reqSeq.current) return;
      setError(e instanceof Error ? e.message : "取得に失敗しました");
    } finally {
      if (my === reqSeq.current) setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      clearInterval(id);
      reqSeq.current++; // 閉じた後に解決した応答は捨てる
    };
  }, [load]);

  // フォーカス管理: 開いたら閉じるボタンへ移し、Tab はシート内で循環させ、
  // 閉じたら開く前の要素 (タップしたカード) に戻す
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    return () => {
      if (opener && document.contains(opener)) {
        opener.focus();
        return;
      }
      // 開いている間にバスが停留所を過ぎてカードが消えた場合は、一覧の先頭へ
      document.querySelector<HTMLElement>("[data-trip-card]")?.focus();
    };
  }, []);

  // Esc で閉じる / Tab トラップ / 背面スクロール停止
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (!panelRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    // overflow:hidden でスクロールバーが消えて背面が横にずれないよう、その幅を補う
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPadding = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPadding;
    };
  }, [onClose]);

  // 初回表示時だけ、バスの現在位置の少し上までスクロールする
  // (20 秒更新のたびに動くと読んでいる位置が飛ぶため)
  useEffect(() => {
    if (!stops.length || scrolledFor.current === tripId) return;
    const row = listRef.current?.querySelector<HTMLElement>(
      '[data-state="current"]',
    );
    if (row && listRef.current) {
      listRef.current.scrollTop = Math.max(0, row.offsetTop - 80);
    }
    scrolledFor.current = tripId;
  }, [stops, tripId]);

  const delayInfo = classifyDelay(trip?.delay);
  const current = stops.find((s) => s.state === "current");
  const remaining = stops.filter((s) => s.state !== "passed").length;
  const live = !ended && trip !== null;

  let positionText: string | null = null;
  if (live && current) {
    const name = current.name ?? "停留所名不明";
    positionText = trip.beforeDeparture
      ? trip.vehicleStatus === "stopped"
        ? `始発 ${name} で発車待ち`
        : `始発 ${name} に向かっています`
      : trip.vehicleStatus === "stopped"
        ? `${name} に停車中`
        : `${name} に接近中`;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="便の詳細"
      style={{ position: "fixed", inset: 0, zIndex: 200 }}
    >
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(2, 6, 23, 0.7)",
        }}
      />
      <div
        ref={panelRef}
        style={{
          position: "absolute",
          left: "50%",
          bottom: 0,
          transform: "translateX(-50%)",
          width: "min(560px, 100%)",
          maxHeight: "min(88dvh, 820px)",
          display: "flex",
          flexDirection: "column",
          background: "#0f172a",
          border: "1px solid #334155",
          borderBottom: "none",
          borderRadius: "16px 16px 0 0",
          boxShadow: "0 -8px 32px rgba(0,0,0,0.5)",
          color: "#f1f5f9",
        }}
      >
        <div
          style={{
            padding: "14px 16px 12px",
            borderBottom: "1px solid #1e293b",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 18, fontWeight: 700 }}>
                  {trip?.routeTitle ?? fallbackTitle ?? "系統不明"}
                </span>
                {trip?.headsign && (
                  <span style={{ fontSize: 14, color: "#cbd5e1" }}>
                    {trip.headsign} 行
                  </span>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 6,
                  flexWrap: "wrap",
                  fontSize: 12,
                  color: "#94a3b8",
                }}
              >
                {live && (
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: delayInfo.color,
                      color: "#fff",
                      fontWeight: 600,
                    }}
                  >
                    {delayInfo.label}
                  </span>
                )}
                {trip?.vehicleNumber && <span>#{trip.vehicleNumber}</span>}
                {trip?.officeName && <span>{trip.officeName}</span>}
                {live && remaining > 0 && <span>残り {remaining} 停留所</span>}
              </div>
            </div>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              style={{
                width: 36,
                height: 36,
                flexShrink: 0,
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: 8,
                fontSize: 18,
                color: "#cbd5e1",
              }}
            >
              ×
            </button>
          </div>
          {positionText && (
            <div
              style={{
                marginTop: 10,
                padding: "8px 10px",
                background: "#1e293b",
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              🚌 現在: <strong>{positionText}</strong>
            </div>
          )}
          {ended && (
            <div
              style={{
                marginTop: 10,
                padding: "8px 10px",
                background: "#1e293b",
                color: "#cbd5e1",
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              この便は運行を終了したか、情報を取得できなくなりました
            </div>
          )}
          {error && (
            <div
              style={{
                marginTop: 10,
                padding: "8px 10px",
                background: "#7f1d1d",
                color: "#fecaca",
                borderRadius: 8,
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          ref={listRef}
          tabIndex={0}
          role="region"
          aria-label="停留所一覧"
          style={{
            overflowY: "auto",
            flex: 1,
            minHeight: 0,
            padding: "8px 0 24px",
            position: "relative",
          }}
        >
          {stops.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "#64748b", fontSize: 13 }}>
              {loading ? "読み込み中..." : ended ? "" : "停留所情報がありません"}
            </div>
          ) : (
            stops.map((s, i) => (
              <StopRow
                key={s.seq}
                stop={s}
                isFirst={i === 0}
                isLast={i === stops.length - 1}
                highlighted={s.seq === highlightSeq}
                live={live}
                stopsAhead={trip ? s.seq - trip.currentStopSequence : Infinity}
                beforeDeparture={trip?.beforeDeparture ?? false}
                busStatusText={
                  trip?.beforeDeparture
                    ? "発車前"
                    : trip?.vehicleStatus === "stopped"
                      ? "停車中"
                      : "接近中"
                }
              />
            ))
          )}
        </div>

        {lastUpdated && !ended && (
          <div
            style={{
              padding: "8px 16px",
              borderTop: "1px solid #1e293b",
              fontSize: 10,
              color: "#64748b",
              flexShrink: 0,
            }}
          >
            {`${lastUpdated.toLocaleTimeString("ja-JP")} 更新 (20秒毎)`}
          </div>
        )}
      </div>
    </div>
  );
}

function StopRow({
  stop,
  isFirst,
  isLast,
  highlighted,
  live,
  stopsAhead,
  beforeDeparture,
  busStatusText,
}: {
  stop: TripStop;
  isFirst: boolean;
  isLast: boolean;
  highlighted: boolean;
  live: boolean; // 運行中の最新情報か (終了後は現在位置・カウントダウンを出さない)
  stopsAhead: number; // バスの現在位置から何停留所先か
  beforeDeparture: boolean;
  busStatusText: string;
}) {
  const passed = stop.state === "passed";
  const busHere = live && stop.state === "current";
  const scheduled = formatEtaSec(stop.scheduledSec);
  const predicted = formatEtaSec(stop.predictedSec);
  const lineColor = "#334155";
  const doneColor = "#475569";

  // 未通過の停留所の相対表示。「まもなく」は接近ボードと同じく停留所数で判定し
  // (始発で発車を待っている間は除く)、それ以外は予想時刻までの分数を出す
  // (予想時刻を過ぎていれば時刻のみ表示)
  let relative: string | null = null;
  if (live && !passed && !busHere) {
    if (!beforeDeparture && stopsAhead <= IMMINENT_STOPS) {
      relative = "まもなく";
    } else if (stop.predictedSec !== undefined) {
      const mins = minutesFromNowJst(stop.predictedSec);
      if (mins >= 1) relative = `約${mins}分後`;
    }
  }

  return (
    <div
      data-state={stop.state}
      style={{
        display: "grid",
        gridTemplateColumns: "64px 24px 1fr",
        alignItems: "stretch",
        minHeight: 44,
        padding: "0 16px",
        background: highlighted ? "rgba(245, 158, 11, 0.12)" : "transparent",
        borderLeft: highlighted ? "3px solid #f59e0b" : "3px solid transparent",
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
          <span style={{ fontSize: 12, color: passed ? doneColor : "#94a3b8" }}>
            {scheduled ?? "—"}
          </span>
        ) : (
          <>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>
              {predicted ?? "—"}
            </span>
            {scheduled && predicted && scheduled !== predicted && (
              <span style={{ fontSize: 10, color: "#64748b" }}>定刻 {scheduled}</span>
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
            background: passed ? doneColor : lineColor,
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
                ? doneColor
                : highlighted
                  ? "#f59e0b"
                  : "#0f172a",
            border: busHere || passed ? "none" : `2px solid ${highlighted ? "#f59e0b" : "#94a3b8"}`,
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
            fontSize: 14,
            fontWeight: busHere || highlighted ? 700 : 400,
            color: passed || stop.name === null ? doneColor : "#f1f5f9",
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
            <span style={{ fontSize: 11, color: "#fbbf24", fontWeight: 600 }}>
              {busStatusText}
            </span>
          )}
          {passed && <span style={{ fontSize: 11, color: doneColor }}>通過</span>}
          {relative && (
            <span style={{ fontSize: 11, color: "#94a3b8" }}>{relative}</span>
          )}
        </span>
      </div>
    </div>
  );
}

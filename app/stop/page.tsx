"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import MultiSelect from "../components/MultiSelect";
import { classifyDelay, formatEtaSec } from "../lib/format";

const REFRESH_MS = 20_000;

interface StopItem {
  name: string;
  // 同名停留所の全ポール (のりば) ID。接近判定はこの全てを対象にする
  ids: string[];
  lat?: number;
  lng?: number;
  poleCount?: number;
}

interface Approach {
  tripId: string;
  routeId?: string;
  routeTitle?: string;
  headsign?: string;
  officeId?: string;
  officeName?: string;
  stopsAway: number;
  delay?: number;
  nextStopName?: string;
  etaSec?: number;
  vehicleNumber?: string;
  lat?: number;
  lng?: number;
}

export default function StopPage() {
  const [stops, setStops] = useState<StopItem[]>([]);
  const [stopsError, setStopsError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<StopItem | null>(null);

  const [approaches, setApproaches] = useState<Approach[]>([]);
  // 系統は複数選択可 (空配列 = すべて)
  const [routeFilters, setRouteFilters] = useState<string[]>([]);
  const [dirFilter, setDirFilter] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 全停留所リストを一度だけ取得
  useEffect(() => {
    let alive = true;
    fetch("/api/stops")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.error) setStopsError(d.error);
        setStops(d.stops || []);
      })
      .catch((e) =>
        setStopsError(e instanceof Error ? e.message : "取得に失敗しました"),
      );
    return () => {
      alive = false;
    };
  }, []);

  const matches = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return stops.filter((s) => s.name.includes(q)).slice(0, 60);
  }, [stops, query]);

  // 選択中の停留所の全ポール ID をカンマ区切りで API に渡す
  const selectedId = selected ? selected.ids.join(",") : null;
  // リクエストトークン。停留所切替や更新の重複時、古い応答が新しい表示を
  // 上書きしないようにする（毎回インクリメントし、解決時に最新かを確認）。
  const reqSeq = useRef(0);
  const fetchApproaches = useCallback(async () => {
    if (!selectedId) return;
    const my = ++reqSeq.current;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/approach?stop=${encodeURIComponent(selectedId)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (my !== reqSeq.current) return; // 古い応答は破棄
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setApproaches(data.approaches || []);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      if (my !== reqSeq.current) return;
      setError(e instanceof Error ? e.message : "取得に失敗しました");
    } finally {
      if (my === reqSeq.current) setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    setApproaches([]);
    setRouteFilters([]);
    setDirFilter("");
    fetchApproaches();
    const id = setInterval(fetchApproaches, REFRESH_MS);
    return () => clearInterval(id);
  }, [selectedId, fetchApproaches]);

  const routeOptions = useMemo(() => {
    const m = new Map<string, { title: string; count: number }>();
    for (const a of approaches) {
      const key = a.routeId ?? a.routeTitle ?? "";
      if (!key) continue;
      const title = a.routeTitle ?? key;
      const cur = m.get(key);
      m.set(key, { title, count: (cur?.count ?? 0) + 1 });
    }
    return Array.from(m.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.title.localeCompare(b.title, "ja"));
  }, [approaches]);

  const routeMatched =
    routeFilters.length > 0
      ? approaches.filter((a) =>
          routeFilters.includes(a.routeId ?? a.routeTitle ?? ""),
        )
      : approaches;

  const dirOptions = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of routeMatched) {
      if (a.headsign) m.set(a.headsign, (m.get(a.headsign) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }, [routeMatched]);

  const shown = dirFilter
    ? routeMatched.filter((a) => a.headsign === dirFilter)
    : routeMatched;

  // 20秒更新で選択中の系統/方面がフィードから消えたら、消えた分だけ解除する
  // （でないと「該当なし」に見えて他の接近バスが隠れてしまう）。
  useEffect(() => {
    setRouteFilters((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.filter((id) => routeOptions.some((r) => r.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [routeOptions]);
  useEffect(() => {
    if (dirFilter && !dirOptions.some((d) => d.name === dirFilter)) {
      setDirFilter("");
    }
  }, [dirOptions, dirFilter]);

  return (
    <div style={{ minHeight: "100dvh", background: "#0f172a", color: "#f1f5f9" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 16px",
          background: "#020617",
          borderBottom: "1px solid #1e293b",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>京王バス 接近案内</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>
            バス停を選んで接近中のバスを確認
          </div>
        </div>
        <nav style={{ display: "flex", gap: 8 }}>
          <NavLink href="/">地図</NavLink>
          <NavLink href="/mobile">スマホ地図</NavLink>
        </nav>
      </header>

      <main style={{ maxWidth: 680, margin: "0 auto", padding: "12px 16px 40px" }}>
        {!selected ? (
          <StopSearch
            query={query}
            onChangeQuery={setQuery}
            matches={matches}
            totalStops={stops.length}
            error={stopsError}
            onSelect={(s) => {
              setSelected(s);
              setQuery("");
            }}
          />
        ) : (
          <>
            <SelectedStopBar
              stop={selected}
              lastUpdated={lastUpdated}
              loading={loading}
              onChange={() => setSelected(null)}
              onRefresh={fetchApproaches}
            />

            {(routeOptions.length > 0 || approaches.length > 0) && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: dirOptions.length > 0 ? "1fr 1fr" : "1fr",
                  gap: 8,
                  margin: "12px 0",
                }}
              >
                <MultiSelect
                  ariaLabel="系統 (複数選択可)"
                  summaryPrefix="系統"
                  placeholder={`系統: すべて (${approaches.length})`}
                  selected={routeFilters}
                  onChange={(v) => {
                    setRouteFilters(v);
                    setDirFilter("");
                  }}
                  options={routeOptions.map((r) => ({
                    value: r.id,
                    label: `${r.title} (${r.count})`,
                  }))}
                  buttonStyle={{ height: 38, borderRadius: 8 }}
                />
                {dirOptions.length > 0 && (
                  <FilterSelect
                    ariaLabel="方面"
                    value={dirFilter}
                    onChange={setDirFilter}
                    placeholder="方面: すべて"
                    options={dirOptions.map((d) => ({
                      value: d.name,
                      label: `${d.name} 行 (${d.count})`,
                    }))}
                  />
                )}
              </div>
            )}

            {error && (
              <div
                style={{
                  padding: "10px 12px",
                  background: "#7f1d1d",
                  color: "#fecaca",
                  borderRadius: 8,
                  fontSize: 12,
                  marginBottom: 10,
                }}
              >
                {error}
              </div>
            )}

            {shown.length === 0 ? (
              <div
                style={{
                  padding: "40px 20px",
                  textAlign: "center",
                  color: "#64748b",
                  fontSize: 14,
                }}
              >
                {approaches.length > 0
                  ? "この系統・方面に一致するバスはありません"
                  : loading
                    ? "接近情報を読み込み中..."
                    : "この停留所に接近中のバスはありません"}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {shown.map((a) => (
                  <ApproachCard key={a.tripId} a={a} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        fontSize: 11,
        color: "#cbd5e1",
        padding: "6px 10px",
        background: "#1e293b",
        border: "1px solid #334155",
        borderRadius: 8,
        textDecoration: "none",
      }}
    >
      {children}
    </Link>
  );
}

function StopSearch({
  query,
  onChangeQuery,
  matches,
  totalStops,
  error,
  onSelect,
}: {
  query: string;
  onChangeQuery: (v: string) => void;
  matches: StopItem[];
  totalStops: number;
  error: string | null;
  onSelect: (s: StopItem) => void;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: 12,
          color: "#94a3b8",
          margin: "8px 0 6px",
        }}
      >
        バス停を名前で検索
      </label>
      <input
        type="search"
        value={query}
        onChange={(e) => onChangeQuery(e.target.value)}
        placeholder="例: 中野駅"
        inputMode="search"
        autoComplete="off"
        autoFocus
        style={{
          width: "100%",
          height: 44,
          padding: "0 12px",
          background: "#1e293b",
          color: "#f1f5f9",
          border: "1px solid #334155",
          borderRadius: 8,
          font: "inherit",
          fontSize: 15,
        }}
      />
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
        {error
          ? `停留所リストの取得に失敗しました: ${error}`
          : `${totalStops.toLocaleString()} 停留所から検索`}
      </div>

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
        {query.trim() && matches.length === 0 && (
          <div style={{ padding: 16, color: "#64748b", fontSize: 13 }}>
            該当するバス停がありません
          </div>
        )}
        {matches.map((s) => (
          <button
            key={s.name}
            onClick={() => onSelect(s)}
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 8,
              width: "100%",
              textAlign: "left",
              padding: "12px 14px",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 8,
              color: "#f1f5f9",
              fontSize: 15,
            }}
          >
            <span>{s.name}</span>
            {(s.poleCount ?? s.ids.length) > 1 && (
              <span style={{ fontSize: 11, color: "#64748b", flexShrink: 0 }}>
                のりば {s.poleCount ?? s.ids.length}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectedStopBar({
  stop,
  lastUpdated,
  loading,
  onChange,
  onRefresh,
}: {
  stop: StopItem;
  lastUpdated: Date | null;
  loading: boolean;
  onChange: () => void;
  onRefresh: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "12px 14px",
        background: "#1e293b",
        border: "1px solid #334155",
        borderRadius: 10,
        marginTop: 8,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "#94a3b8" }}>接近案内</div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {stop.name}
        </div>
        <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>
          {loading
            ? "更新中..."
            : lastUpdated
              ? `${lastUpdated.toLocaleTimeString("ja-JP")} 更新 (20秒毎)`
              : ""}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button
          onClick={onRefresh}
          disabled={loading}
          aria-label="更新"
          style={{
            width: 38,
            height: 38,
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: 8,
            fontSize: 16,
            opacity: loading ? 0.5 : 1,
          }}
        >
          ↻
        </button>
        <button
          onClick={onChange}
          style={{
            height: 38,
            padding: "0 12px",
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: 8,
            fontSize: 13,
            color: "#cbd5e1",
          }}
        >
          変更
        </button>
      </div>
    </div>
  );
}

function FilterSelect({
  ariaLabel,
  value,
  onChange,
  placeholder,
  options,
}: {
  ariaLabel: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        height: 38,
        padding: "0 8px",
        background: "#1e293b",
        color: "#f1f5f9",
        border: "1px solid #334155",
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function ApproachCard({ a }: { a: Approach }) {
  const delay = classifyDelay(a.delay);
  const eta = formatEtaSec(a.etaSec);
  const imminent = a.stopsAway <= 0;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 12,
        padding: "12px 14px",
        background: "#1e293b",
        border: `1px solid ${imminent ? "#f59e0b" : "#334155"}`,
        borderRadius: 10,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 96,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          borderRight: "1px solid #334155",
          paddingRight: 12,
        }}
      >
        <div
          style={{
            fontSize: imminent ? 18 : 16,
            fontWeight: 700,
            color: imminent ? "#fbbf24" : "#f1f5f9",
            lineHeight: 1.1,
          }}
        >
          {imminent ? "まもなく" : `あと ${a.stopsAway}`}
        </div>
        {!imminent && (
          <div style={{ fontSize: 10, color: "#94a3b8" }}>停留所</div>
        )}
        {eta && (
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
            {eta} 着予定
          </div>
        )}
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 700 }}>
            {a.routeTitle ?? "系統不明"}
          </span>
          {a.headsign && (
            <span style={{ fontSize: 13, color: "#cbd5e1" }}>
              {a.headsign} 行
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "#94a3b8",
            marginTop: 4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {a.nextStopName ? `次: ${a.nextStopName} 付近` : ""}
          {a.vehicleNumber ? ` · #${a.vehicleNumber}` : ""}
          {a.officeName ? ` · ${a.officeName}` : ""}
        </div>
      </div>

      <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
        <span
          style={{
            padding: "3px 8px",
            borderRadius: 999,
            background: delay.color,
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          {delay.label}
        </span>
      </div>
    </div>
  );
}

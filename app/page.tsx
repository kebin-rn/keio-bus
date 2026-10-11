"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { APIProvider } from "@vis.gl/react-google-maps";
import BusMap, { type MapPadding } from "./components/BusMap";
import BusInfoPanel from "./components/BusInfoPanel";
import MultiSelect from "./components/MultiSelect";
import RouteToggle from "./components/RouteToggle";
import { useBusData } from "./hooks/useBusData";
import { useShowRoute } from "./hooks/useShowRoute";
import { classifyDelay, shortenPatternId, shortenStopId } from "./lib/format";
import type { OdptBus, OdptBusroutePattern } from "./types/odpt";

// 選択中のバスの情報カード (地図の左上) の位置と幅
const INFO_CARD_TOP = 60;
const INFO_CARD_LEFT = 10;
const INFO_CARD_WIDTH = 280;
// 便を選んだときに経路へ表示範囲を合わせる余白。経路が情報カードに隠れないよう、
// 左側はカードの幅の分を空ける
const MAP_FIT_PADDING: MapPadding = {
  top: 60,
  right: 60,
  bottom: 60,
  left: INFO_CARD_LEFT + INFO_CARD_WIDTH + 30,
};

export default function Page() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

  const {
    buses,
    patternMap,
    stopMap,
    officeMap,
    lastUpdated,
    loading,
    error,
    refresh: fetchBuses,
  } = useBusData();

  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [officeFilter, setOfficeFilter] = useState("");
  // 系統・方面は複数選択可 (空配列 = すべて)
  const [routeFilters, setRouteFilters] = useState<string[]>([]);
  const [directionFilters, setDirectionFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showRoute, setShowRoute] = useShowRoute();

  const officeBuses = officeFilter
    ? buses.filter((b) => b.officeId === officeFilter)
    : buses;

  const routedBuses =
    routeFilters.length > 0
      ? officeBuses.filter((b) => {
          const pid = b["odpt:busroutePattern"];
          return pid ? routeFilters.includes(pid) : false;
        })
      : officeBuses;

  const officeOptions = useMemo(() => {
    const counts: Record<string, { name: string; count: number }> = {};
    for (const b of buses) {
      const oid = b.officeId;
      if (!oid) continue;
      const name = officeMap[oid]?.name || oid;
      counts[oid] = counts[oid]
        ? { name, count: counts[oid].count + 1 }
        : { name, count: 1 };
    }
    return Object.entries(counts)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }, [buses, officeMap]);

  const routeOptions = useMemo(() => {
    const counts: Record<string, { title: string; count: number }> = {};
    for (const b of officeBuses) {
      const pid = b["odpt:busroutePattern"];
      if (!pid) continue;
      const title = patternMap[pid]?.["dc:title"] || shortenPatternId(pid);
      counts[pid] = counts[pid]
        ? { title, count: counts[pid].count + 1 }
        : { title, count: 1 };
    }
    return Object.entries(counts)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.title.localeCompare(b.title, "ja"));
  }, [officeBuses, patternMap]);

  // 系統選択時のみ方面オプションを構築 (= 選択中系統の trip_headsign の集合)
  const directionOptions = useMemo(() => {
    if (routeFilters.length === 0) return [];
    const counts = new Map<string, number>();
    for (const b of routedBuses) {
      const h = b.tripHeadsign;
      if (h) counts.set(h, (counts.get(h) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }, [routedBuses, routeFilters]);

  // 方面がフィードから消えても自動解除はしない。MultiSelect が消えた選択を
  // 「(現在運行なし)」の行として表示し、個別に解除できるため (系統と同じ扱い)。
  const directedBuses =
    directionFilters.length > 0
      ? routedBuses.filter(
          (b) => b.tripHeadsign && directionFilters.includes(b.tripHeadsign),
        )
      : routedBuses;

  const q = searchQuery.trim().toLowerCase();
  const displayedBuses = q
    ? directedBuses.filter((b) =>
        (b["odpt:vehicleNumber"] ?? "").toLowerCase().includes(q),
      )
    : directedBuses;

  // 地図に表示中のバスから探す (検索などで地図から消えたらカードも閉じる)
  const selectedBus =
    displayedBuses.find((b) => b["@id"] === selectedBusId) ?? null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "auto auto 1fr",
        height: "100vh",
        minHeight: 0,
      }}
    >
      <Header
        lastUpdated={lastUpdated}
        loading={loading}
        error={error}
        onRefresh={fetchBuses}
        totalBuses={buses.length}
        routeToggle={
          // 地図を出しているときだけ。フィルタ欄に置くと欄が折り返しやすくなる
          // (幅 1,024px 前後で系統を選ぶと 2 段になり地図が縮む) ため、余白のある
          // 画面上部に置く。高さは隣のボタンに合わせる
          apiKey ? (
            <RouteToggle
              checked={showRoute}
              onChange={setShowRoute}
              style={{ height: "auto", padding: "6px 10px", fontSize: 12 }}
            />
          ) : null
        }
      />
      {apiKey && (
        <FilterToolbar
          allCount={buses.length}
          officeCount={officeBuses.length}
          officeFilter={officeFilter}
          routeFilters={routeFilters}
          directionFilters={directionFilters}
          searchQuery={searchQuery}
          officeOptions={officeOptions}
          routeOptions={routeOptions}
          directionOptions={directionOptions}
          onChangeOffice={(v) => {
            setOfficeFilter(v);
            setRouteFilters([]);
            setDirectionFilters([]);
            setSelectedBusId(null);
          }}
          onChangeRoutes={(v) => {
            setRouteFilters(v);
            setDirectionFilters([]);
            setSelectedBusId(null);
          }}
          onChangeDirections={(v) => {
            setDirectionFilters(v);
            setSelectedBusId(null);
          }}
          onChangeSearch={setSearchQuery}
        />
      )}
      {!apiKey ? (
        <ApiKeyMissing />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) 320px",
            minHeight: 0,
          }}
        >
          <div style={{ position: "relative", minHeight: 0, minWidth: 0 }}>
            <APIProvider apiKey={apiKey}>
              <BusMap
                buses={displayedBuses}
                selectedBusId={selectedBusId}
                onSelectBus={setSelectedBusId}
                mapId={mapId}
                fitPadding={MAP_FIT_PADDING}
                showRoute={showRoute}
              />
            </APIProvider>
            {selectedBus && (
              <SelectedBusCard
                bus={selectedBus}
                patternMap={patternMap}
                stopMap={stopMap}
                onClose={() => setSelectedBusId(null)}
              />
            )}
            {loading && <LoadingOverlay />}
          </div>
          <BusInfoPanel
            displayedBuses={displayedBuses}
            patternMap={patternMap}
            stopMap={stopMap}
            selectedBusId={selectedBusId}
            onSelectBus={setSelectedBusId}
          />
        </div>
      )}
    </div>
  );
}

function Header({
  lastUpdated,
  loading,
  error,
  onRefresh,
  totalBuses,
  routeToggle,
}: {
  lastUpdated: Date | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  totalBuses: number;
  routeToggle: React.ReactNode;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 18px",
        background: "#020617",
        borderBottom: "1px solid #1e293b",
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>
          京王バス 運行情報マップ
        </div>
        <div style={{ fontSize: 11, color: "#64748b" }}>
          Data: 公共交通オープンデータセンター ·{" "}
          {totalBuses}台運行中
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {routeToggle}
        {error && (
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              background: "#7f1d1d",
              color: "#fecaca",
              borderRadius: 999,
            }}
          >
            {error}
          </span>
        )}
        <span style={{ fontSize: 11, color: "#94a3b8" }}>
          {loading
            ? "読み込み中..."
            : lastUpdated
              ? `${lastUpdated.toLocaleTimeString("ja-JP")} 更新`
              : "未取得"}
        </span>
        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            padding: "6px 12px",
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 6,
            fontSize: 12,
            opacity: loading ? 0.5 : 1,
          }}
        >
          更新
        </button>
        <Link
          href="/stop"
          style={{
            padding: "6px 12px",
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 6,
            fontSize: 12,
            color: "#cbd5e1",
            textDecoration: "none",
          }}
        >
          接近案内
        </Link>
        <Link
          href="/mobile"
          style={{
            padding: "6px 12px",
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 6,
            fontSize: 12,
            color: "#cbd5e1",
            textDecoration: "none",
          }}
        >
          スマホ版
        </Link>
      </div>
    </header>
  );
}

function FilterToolbar({
  allCount,
  officeCount,
  officeFilter,
  routeFilters,
  directionFilters,
  searchQuery,
  officeOptions,
  routeOptions,
  directionOptions,
  onChangeOffice,
  onChangeRoutes,
  onChangeDirections,
  onChangeSearch,
}: {
  allCount: number;
  officeCount: number;
  officeFilter: string;
  routeFilters: string[];
  directionFilters: string[];
  searchQuery: string;
  officeOptions: { id: string; name: string; count: number }[];
  routeOptions: { id: string; title: string; count: number }[];
  directionOptions: { name: string; count: number }[];
  onChangeOffice: (v: string) => void;
  onChangeRoutes: (v: string[]) => void;
  onChangeDirections: (v: string[]) => void;
  onChangeSearch: (v: string) => void;
}) {
  // 選択済みの方面が残っている間は選択肢が空でもコントロールを出し続ける
  // (見えないフィルタ化を防ぐ)
  const showDirection =
    routeFilters.length > 0 &&
    (directionOptions.length > 0 || directionFilters.length > 0);
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
        padding: "10px 18px",
        background: "#0f172a",
        borderBottom: "1px solid #1e293b",
      }}
    >
      <div
        style={{ position: "relative", flex: "1 1 220px", maxWidth: 320 }}
      >
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onChangeSearch(e.target.value)}
          placeholder="車番で検索 (例: 21303)"
          inputMode="search"
          autoComplete="off"
          aria-label="車番で検索"
          style={{
            width: "100%",
            height: 34,
            padding: "0 30px 0 10px",
            background: "#1e293b",
            color: "#f1f5f9",
            border: "1px solid #334155",
            borderRadius: 6,
            font: "inherit",
            fontSize: 13,
          }}
        />
        {searchQuery && (
          <button
            onClick={() => onChangeSearch("")}
            aria-label="検索条件をクリア"
            style={{
              position: "absolute",
              right: 4,
              top: "50%",
              transform: "translateY(-50%)",
              width: 26,
              height: 26,
              color: "#94a3b8",
              fontSize: 16,
              lineHeight: 1,
              borderRadius: 4,
            }}
          >
            ×
          </button>
        )}
      </div>
      <ToolbarSelect
        ariaLabel="営業所"
        value={officeFilter}
        onChange={onChangeOffice}
        placeholder={`営業所: すべて (${allCount}台)`}
        options={officeOptions.map((o) => ({
          value: o.id,
          label: `${o.name} (${o.count})`,
        }))}
      />
      <MultiSelect
        ariaLabel="系統 (複数選択可)"
        summaryPrefix="系統"
        placeholder={`系統: すべて (${officeCount}台)`}
        selected={routeFilters}
        onChange={onChangeRoutes}
        options={routeOptions.map((r) => ({
          value: r.id,
          label: `${r.title} (${r.count})`,
        }))}
        containerStyle={{ flex: "0 1 220px", minWidth: 160, maxWidth: 260 }}
      />
      {showDirection && (
        <MultiSelect
          ariaLabel="方面 (複数選択可)"
          summaryPrefix="方面"
          placeholder="方面: すべて"
          selected={directionFilters}
          onChange={onChangeDirections}
          options={directionOptions.map((d) => ({
            value: d.name,
            label: `${d.name} 行 (${d.count})`,
          }))}
          containerStyle={{ flex: "0 1 220px", minWidth: 160, maxWidth: 260 }}
        />
      )}
    </div>
  );
}

function ToolbarSelect({
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
        flex: "0 1 220px",
        minWidth: 160,
        maxWidth: 260,
        height: 34,
        padding: "0 8px",
        background: "#1e293b",
        color: "#f1f5f9",
        border: "1px solid #334155",
        borderRadius: 6,
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

// 選択中のバスの情報。バスの真上に吹き出しで出すと、その先の経路が隠れて
// しまうため、地図の左上に固定して表示する
function SelectedBusCard({
  bus,
  patternMap,
  stopMap,
  onClose,
}: {
  bus: OdptBus;
  patternMap: Record<string, OdptBusroutePattern>;
  stopMap: Record<string, { title: string; lat?: number; lng?: number }>;
  onClose: () => void;
}) {
  const delay = classifyDelay(bus["odpt:delay"]);
  const pattern = bus["odpt:busroutePattern"]
    ? patternMap[bus["odpt:busroutePattern"]]
    : undefined;
  const from = bus["odpt:fromBusstopPole"];
  const to = bus["odpt:toBusstopPole"];
  const fromName = from ? stopMap[from]?.title || shortenStopId(from) : "—";
  const toName = to ? stopMap[to]?.title || shortenStopId(to) : "—";

  return (
    <div
      style={{
        position: "absolute",
        top: INFO_CARD_TOP,
        left: INFO_CARD_LEFT,
        width: INFO_CARD_WIDTH,
        zIndex: 5,
        padding: "12px 14px",
        background: "#ffffff",
        color: "#0f172a",
        borderRadius: 8,
        boxShadow: "0 2px 7px 1px rgba(0,0,0,0.3)",
      }}
    >
      <button
        onClick={onClose}
        aria-label="閉じる"
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          width: 28,
          height: 28,
          borderRadius: 4,
          color: "#64748b",
          fontSize: 18,
          lineHeight: 1,
        }}
      >
        ×
      </button>
      <div style={{ fontWeight: 700, fontSize: 14, paddingRight: 28 }}>
        {pattern?.["dc:title"] || "系統情報なし"}
      </div>
      {bus.tripHeadsign && (
        <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
          {bus.tripHeadsign} 行
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "8px 0" }}>
        <span
          style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: 999,
            background: delay.color,
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {delay.label}
        </span>
        {bus["odpt:vehicleNumber"] && (
          <span style={{ fontSize: 12, color: "#475569" }}>
            #{bus["odpt:vehicleNumber"]}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: "#334155" }}>
        <div>
          <span style={{ color: "#64748b" }}>直前: </span>
          {fromName}
        </div>
        <div>
          <span style={{ color: "#64748b" }}>次の停留所: </span>
          <strong>{toName}</strong>
        </div>
        {bus["odpt:speed"] !== undefined && (
          <div>
            <span style={{ color: "#64748b" }}>速度: </span>
            {bus["odpt:speed"]} km/h
          </div>
        )}
        {bus["dc:date"] && (
          <div style={{ marginTop: 4, color: "#94a3b8" }}>
            {new Date(bus["dc:date"]).toLocaleTimeString("ja-JP")} 時点
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingOverlay() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(15, 23, 42, 0.6)",
        zIndex: 10,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          padding: "10px 18px",
          background: "#0f172a",
          border: "1px solid #334155",
          borderRadius: 8,
          fontSize: 13,
        }}
      >
        運行情報を読み込み中...
      </div>
    </div>
  );
}

function ApiKeyMissing() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 480,
          padding: 20,
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 8,
          lineHeight: 1.6,
          fontSize: 14,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>
          Google Maps API キーが設定されていません
        </div>
        <div style={{ color: "#cbd5e1" }}>
          <code
            style={{
              background: "#020617",
              padding: "2px 6px",
              borderRadius: 4,
            }}
          >
            .env.local
          </code>{" "}
          に{" "}
          <code
            style={{
              background: "#020617",
              padding: "2px 6px",
              borderRadius: 4,
            }}
          >
            NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
          </code>{" "}
          を設定して再起動してください。詳しくは README を参照。
        </div>
      </div>
    </div>
  );
}

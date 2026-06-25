"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { APIProvider } from "@vis.gl/react-google-maps";
import BusMap from "./components/BusMap";
import BusInfoPanel from "./components/BusInfoPanel";
import { useBusData } from "./hooks/useBusData";

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
  const [routeFilter, setRouteFilter] = useState("");
  const [directionFilter, setDirectionFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const officeBuses = officeFilter
    ? buses.filter((b) => b.officeId === officeFilter)
    : buses;

  const routedBuses = routeFilter
    ? officeBuses.filter((b) => b["odpt:busroutePattern"] === routeFilter)
    : officeBuses;

  // 系統選択時のみ方面オプションを構築 (= 当該系統の trip_headsign の集合)
  const directionOptions = useMemo(() => {
    if (!routeFilter) return [];
    const counts = new Map<string, number>();
    for (const b of routedBuses) {
      const h = b.tripHeadsign;
      if (h) counts.set(h, (counts.get(h) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }, [routedBuses, routeFilter]);

  const directedBuses = directionFilter
    ? routedBuses.filter((b) => b.tripHeadsign === directionFilter)
    : routedBuses;

  const q = searchQuery.trim().toLowerCase();
  const displayedBuses = q
    ? directedBuses.filter((b) =>
        (b["odpt:vehicleNumber"] ?? "").toLowerCase().includes(q),
      )
    : directedBuses;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "auto 1fr",
        height: "100vh",
      }}
    >
      <Header
        lastUpdated={lastUpdated}
        loading={loading}
        error={error}
        onRefresh={fetchBuses}
        totalBuses={buses.length}
      />
      {!apiKey ? (
        <ApiKeyMissing />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) 340px",
            height: "100%",
            minHeight: 0,
          }}
        >
          <div style={{ position: "relative", minHeight: 0 }}>
            <APIProvider apiKey={apiKey}>
              <BusMap
                buses={displayedBuses}
                patternMap={patternMap}
                stopMap={stopMap}
                selectedBusId={selectedBusId}
                onSelectBus={setSelectedBusId}
                mapId={mapId}
              />
            </APIProvider>
            {loading && <LoadingOverlay />}
          </div>
          <BusInfoPanel
            allBuses={buses}
            officeBuses={officeBuses}
            displayedBuses={displayedBuses}
            patternMap={patternMap}
            stopMap={stopMap}
            officeMap={officeMap}
            directionOptions={directionOptions}
            selectedBusId={selectedBusId}
            onSelectBus={setSelectedBusId}
            officeFilter={officeFilter}
            onChangeOfficeFilter={(v) => {
              setOfficeFilter(v);
              setRouteFilter("");
              setDirectionFilter("");
              setSelectedBusId(null);
            }}
            routeFilter={routeFilter}
            onChangeRouteFilter={(v) => {
              setRouteFilter(v);
              setDirectionFilter("");
              setSelectedBusId(null);
            }}
            directionFilter={directionFilter}
            onChangeDirectionFilter={(v) => {
              setDirectionFilter(v);
              setSelectedBusId(null);
            }}
            searchQuery={searchQuery}
            onChangeSearchQuery={setSearchQuery}
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
}: {
  lastUpdated: Date | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  totalBuses: number;
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

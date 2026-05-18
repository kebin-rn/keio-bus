"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import BusMap from "./components/BusMap";
import BusInfoPanel from "./components/BusInfoPanel";
import type { OdptBus, OdptBusroutePattern } from "./types/odpt";

const REFRESH_INTERVAL_MS = 30_000;

type StopMap = Record<string, { title: string; lat?: number; lng?: number }>;

export default function Page() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

  const [buses, setBuses] = useState<OdptBus[]>([]);
  const [patternMap, setPatternMap] = useState<Record<string, OdptBusroutePattern>>({});
  const [stopMap, setStopMap] = useState<StopMap>({});
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [routeFilter, setRouteFilter] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initial = useRef(true);

  const fetchBuses = useCallback(async () => {
    try {
      const res = await fetch("/api/buses", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setBuses(data.buses || []);
      if (data.patternMap) setPatternMap(data.patternMap);
      if (data.stopMap) setStopMap(data.stopMap);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得に失敗しました");
    } finally {
      if (initial.current) {
        setLoading(false);
        initial.current = false;
      }
    }
  }, []);

  useEffect(() => {
    fetchBuses();
    const id = setInterval(fetchBuses, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchBuses]);

  const displayedBuses = routeFilter
    ? buses.filter((b) => b["odpt:busroutePattern"] === routeFilter)
    : buses;

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
            buses={buses}
            patternMap={patternMap}
            stopMap={stopMap}
            selectedBusId={selectedBusId}
            onSelectBus={setSelectedBusId}
            routeFilter={routeFilter}
            onChangeRouteFilter={(v) => {
              setRouteFilter(v);
              setSelectedBusId(null);
            }}
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

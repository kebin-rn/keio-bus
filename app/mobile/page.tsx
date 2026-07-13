"use client";

import { useMemo, useState } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import Link from "next/link";
import BusMap from "../components/BusMap";
import MultiSelect from "../components/MultiSelect";
import { useBusData } from "../hooks/useBusData";
import {
  classifyDelay,
  shortenPatternId,
  shortenStopId,
} from "../lib/format";
import type { OdptBus } from "../types/odpt";

export default function MobilePage() {
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
    refresh,
  } = useBusData();

  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [officeFilter, setOfficeFilter] = useState("");
  // 系統は複数選択可 (空配列 = すべて)
  const [routeFilters, setRouteFilters] = useState<string[]>([]);
  const [directionFilter, setDirectionFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

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
  const directedBuses = directionFilter
    ? routedBuses.filter((b) => b.tripHeadsign === directionFilter)
    : routedBuses;
  const q = searchQuery.trim().toLowerCase();
  const displayedBuses = q
    ? directedBuses.filter((b) =>
        (b["odpt:vehicleNumber"] ?? "").toLowerCase().includes(q),
      )
    : directedBuses;

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

  const selectedBus = useMemo(
    () => buses.find((b) => b["@id"] === selectedBusId) ?? null,
    [buses, selectedBusId],
  );

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "auto auto 1fr",
        height: "100dvh",
        overflow: "hidden",
      }}
    >
      <MobileHeader
        totalBuses={buses.length}
        lastUpdated={lastUpdated}
        loading={loading}
        error={error}
        onRefresh={refresh}
      />
      <FilterBar
        officeFilter={officeFilter}
        routeFilters={routeFilters}
        directionFilter={directionFilter}
        searchQuery={searchQuery}
        officeOptions={officeOptions}
        routeOptions={routeOptions}
        directionOptions={directionOptions}
        allCount={buses.length}
        filteredCount={officeBuses.length}
        onChangeOffice={(v) => {
          setOfficeFilter(v);
          setRouteFilters([]);
          setDirectionFilter("");
          setSelectedBusId(null);
        }}
        onChangeRoutes={(v) => {
          setRouteFilters(v);
          setDirectionFilter("");
          setSelectedBusId(null);
        }}
        onChangeDirection={(v) => {
          setDirectionFilter(v);
          setSelectedBusId(null);
        }}
        onChangeSearch={setSearchQuery}
      />

      <div style={{ position: "relative", minHeight: 0 }}>
        {apiKey ? (
          <APIProvider apiKey={apiKey}>
            <BusMap
              buses={displayedBuses}
              patternMap={patternMap}
              stopMap={stopMap}
              selectedBusId={selectedBusId}
              onSelectBus={(id) => {
                setSelectedBusId(id);
                if (id) setSheetOpen(false);
              }}
              mapId={mapId}
              hideInfoWindow
            />
          </APIProvider>
        ) : (
          <ApiKeyMissing />
        )}

        {selectedBus ? (
          <BusDetailCard
            bus={selectedBus}
            patternMap={patternMap}
            stopMap={stopMap}
            officeMap={officeMap}
            onClose={() => setSelectedBusId(null)}
          />
        ) : (
          <BottomSheet
            open={sheetOpen}
            onToggle={() => setSheetOpen((v) => !v)}
            count={displayedBuses.length}
          >
            <BusListInSheet
              buses={displayedBuses}
              patternMap={patternMap}
              stopMap={stopMap}
              onSelect={(id) => {
                setSelectedBusId(id);
                setSheetOpen(false);
              }}
            />
          </BottomSheet>
        )}
      </div>
    </div>
  );
}

function MobileHeader({
  totalBuses,
  lastUpdated,
  loading,
  error,
  onRefresh,
}: {
  totalBuses: number;
  lastUpdated: Date | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        background: "#020617",
        borderBottom: "1px solid #1e293b",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 14,
            display: "flex",
            alignItems: "baseline",
            gap: 8,
          }}
        >
          <span>京王バス</span>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            {totalBuses}台運行中
          </span>
        </div>
        <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>
          {error ? (
            <span style={{ color: "#fca5a5" }}>{error}</span>
          ) : lastUpdated ? (
            `${lastUpdated.toLocaleTimeString("ja-JP")} 更新`
          ) : (
            "読み込み中..."
          )}
        </div>
      </div>
      <button
        onClick={onRefresh}
        disabled={loading}
        aria-label="更新"
        style={{
          width: 36,
          height: 36,
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 8,
          fontSize: 16,
          opacity: loading ? 0.5 : 1,
        }}
      >
        ↻
      </button>
      <Link
        href="/stop"
        style={{
          fontSize: 11,
          color: "#94a3b8",
          padding: "8px 10px",
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 8,
          textDecoration: "none",
        }}
      >
        接近
      </Link>
      <Link
        href="/"
        style={{
          fontSize: 11,
          color: "#94a3b8",
          padding: "8px 10px",
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 8,
          textDecoration: "none",
        }}
      >
        PC版
      </Link>
    </header>
  );
}

function FilterBar({
  officeFilter,
  routeFilters,
  directionFilter,
  searchQuery,
  officeOptions,
  routeOptions,
  directionOptions,
  allCount,
  filteredCount,
  onChangeOffice,
  onChangeRoutes,
  onChangeDirection,
  onChangeSearch,
}: {
  officeFilter: string;
  routeFilters: string[];
  directionFilter: string;
  searchQuery: string;
  officeOptions: { id: string; name: string; count: number }[];
  routeOptions: { id: string; title: string; count: number }[];
  directionOptions: { name: string; count: number }[];
  allCount: number;
  filteredCount: number;
  onChangeOffice: (v: string) => void;
  onChangeRoutes: (v: string[]) => void;
  onChangeDirection: (v: string) => void;
  onChangeSearch: (v: string) => void;
}) {
  const showDirection = routeFilters.length > 0 && directionOptions.length > 0;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "8px 12px",
        background: "#0f172a",
        borderBottom: "1px solid #1e293b",
      }}
    >
      <div style={{ position: "relative" }}>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onChangeSearch(e.target.value)}
          placeholder="車番で検索 (例: 21303)"
          inputMode="search"
          autoComplete="off"
          aria-label="車番で検索"
          style={{
            ...selectStyle,
            paddingRight: 32,
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
              width: 28,
              height: 28,
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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
        }}
      >
        <select
          value={officeFilter}
          onChange={(e) => onChangeOffice(e.target.value)}
          style={selectStyle}
          aria-label="営業所"
        >
          <option value="">営業所: 全{allCount}台</option>
          {officeOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} ({o.count})
            </option>
          ))}
        </select>
        <MultiSelect
          ariaLabel="系統 (複数選択可)"
          summaryPrefix="系統"
          placeholder={`系統: 全${filteredCount}台`}
          selected={routeFilters}
          onChange={onChangeRoutes}
          align="right"
          options={routeOptions.map((r) => ({
            value: r.id,
            label: `${r.title} (${r.count})`,
          }))}
          buttonStyle={{ height: 42, borderRadius: 8 }}
        />
      </div>
      {showDirection && (
        <select
          value={directionFilter}
          onChange={(e) => onChangeDirection(e.target.value)}
          style={selectStyle}
          aria-label="方面"
        >
          <option value="">方面: すべて</option>
          {directionOptions.map((d) => (
            <option key={d.name} value={d.name}>
              {d.name} 行 ({d.count})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  padding: "10px 8px",
  background: "#1e293b",
  color: "#f1f5f9",
  border: "1px solid #334155",
  borderRadius: 8,
  fontSize: 13,
  appearance: "none",
};

function BottomSheet({
  open,
  onToggle,
  count,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        background: "#0f172a",
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
        boxShadow: "0 -6px 20px rgba(0,0,0,0.4)",
        maxHeight: open ? "70%" : 52,
        transition: "max-height 220ms ease",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        zIndex: 5,
      }}
    >
      <button
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          width: "100%",
          color: "#f1f5f9",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 32,
            height: 4,
            background: "#475569",
            borderRadius: 2,
            position: "absolute",
            top: 6,
            left: "50%",
            transform: "translateX(-50%)",
          }}
        />
        <span>一覧 ({count}台)</span>
        <span style={{ color: "#94a3b8", fontSize: 18 }}>
          {open ? "▼" : "▲"}
        </span>
      </button>
      {open && (
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function BusListInSheet({
  buses,
  patternMap,
  stopMap,
  onSelect,
}: {
  buses: OdptBus[];
  patternMap: Record<string, import("../types/odpt").OdptBusroutePattern>;
  stopMap: Record<string, { title: string; lat?: number; lng?: number }>;
  onSelect: (id: string) => void;
}) {
  const sorted = useMemo(
    () =>
      [...buses].sort((a, b) => {
        const da = a["odpt:delay"] ?? -Infinity;
        const db = b["odpt:delay"] ?? -Infinity;
        return db - da;
      }),
    [buses],
  );

  if (!sorted.length) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>
        該当するバスがありません
      </div>
    );
  }

  return (
    <div>
      {sorted.map((bus) => {
        const delay = classifyDelay(bus["odpt:delay"]);
        const pid = bus["odpt:busroutePattern"];
        const title =
          (pid && patternMap[pid]?.["dc:title"]) || shortenPatternId(pid);
        const to = bus["odpt:toBusstopPole"];
        const toName = to ? stopMap[to]?.title || shortenStopId(to) : "—";
        return (
          <button
            key={bus["@id"]}
            onClick={() => onSelect(bus["@id"])}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "12px 16px",
              borderBottom: "1px solid #1e293b",
              color: "#f1f5f9",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                }}
              >
                {title}
              </div>
              <span
                style={{
                  flexShrink: 0,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: delay.color,
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {delay.label}
              </span>
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
              次: {toName}
              {bus["odpt:vehicleNumber"] && ` · #${bus["odpt:vehicleNumber"]}`}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function BusDetailCard({
  bus,
  patternMap,
  stopMap,
  officeMap,
  onClose,
}: {
  bus: OdptBus;
  patternMap: Record<string, import("../types/odpt").OdptBusroutePattern>;
  stopMap: Record<string, { title: string; lat?: number; lng?: number }>;
  officeMap: Record<string, import("../types/odpt").OfficeEntry>;
  onClose: () => void;
}) {
  const delay = classifyDelay(bus["odpt:delay"]);
  const pid = bus["odpt:busroutePattern"];
  const title = (pid && patternMap[pid]?.["dc:title"]) || shortenPatternId(pid);
  const to = bus["odpt:toBusstopPole"];
  const toName = to ? stopMap[to]?.title || shortenStopId(to) : "—";
  const officeName = bus.officeId ? officeMap[bus.officeId]?.name : undefined;

  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: 12,
        background: "#0f172a",
        borderRadius: 14,
        border: "1px solid #1e293b",
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
        padding: "14px 14px 12px",
        color: "#f1f5f9",
        zIndex: 5,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "start",
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 16,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </div>
          {bus.tripHeadsign && (
            <div
              style={{
                fontSize: 12,
                color: "#94a3b8",
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {bus.tripHeadsign} 行
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="閉じる"
          style={{
            width: 32,
            height: 32,
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 8,
            color: "#cbd5e1",
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          marginTop: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span
          style={{
            padding: "3px 10px",
            borderRadius: 999,
            background: delay.color,
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {delay.label}
        </span>
        {officeName && (
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 999,
              background: "#1e293b",
              color: "#cbd5e1",
              fontSize: 12,
              border: "1px solid #334155",
            }}
          >
            {officeName}
          </span>
        )}
        {bus["odpt:vehicleNumber"] && (
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            #{bus["odpt:vehicleNumber"]}
          </span>
        )}
        {bus["odpt:speed"] !== undefined && (
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            {bus["odpt:speed"]} km/h
          </span>
        )}
      </div>

      <div
        style={{
          marginTop: 10,
          fontSize: 13,
          color: "#cbd5e1",
        }}
      >
        <span style={{ color: "#64748b" }}>次の停留所: </span>
        <strong>{toName}</strong>
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
        color: "#cbd5e1",
        fontSize: 13,
        textAlign: "center",
      }}
    >
      Google Maps API キーが設定されていません。
      <br />
      環境変数 <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> を設定してください。
    </div>
  );
}

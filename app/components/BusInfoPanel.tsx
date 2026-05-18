"use client";

import { useMemo } from "react";
import type {
  AgencyEntry,
  OdptBus,
  OdptBusroutePattern,
} from "@/app/types/odpt";
import { classifyDelay, shortenPatternId, shortenStopId } from "@/app/lib/format";

interface Props {
  buses: OdptBus[];
  allBuses: OdptBus[];
  patternMap: Record<string, OdptBusroutePattern>;
  stopMap: Record<string, { title: string; lat?: number; lng?: number }>;
  agencyMap: Record<string, AgencyEntry>;
  selectedBusId: string | null;
  onSelectBus: (id: string | null) => void;
  agencyFilter: string;
  onChangeAgencyFilter: (v: string) => void;
  routeFilter: string;
  onChangeRouteFilter: (v: string) => void;
}

export default function BusInfoPanel({
  buses,
  allBuses,
  patternMap,
  stopMap,
  agencyMap,
  selectedBusId,
  onSelectBus,
  agencyFilter,
  onChangeAgencyFilter,
  routeFilter,
  onChangeRouteFilter,
}: Props) {
  const stats = useMemo(() => {
    let onTime = 0,
      minor = 0,
      major = 0,
      early = 0,
      unknown = 0;
    for (const b of buses) {
      const c = classifyDelay(b["odpt:delay"]).level;
      if (c === "ontime") onTime++;
      else if (c === "minor") minor++;
      else if (c === "major") major++;
      else if (c === "early") early++;
      else unknown++;
    }
    return { total: buses.length, onTime, minor, major, early, unknown };
  }, [buses]);

  const agencyOptions = useMemo(() => {
    const counts: Record<string, { name: string; count: number }> = {};
    for (const b of allBuses) {
      const pid = b["odpt:busroutePattern"];
      const aid = pid ? patternMap[pid]?.agencyId : undefined;
      if (!aid) continue;
      const name = agencyMap[aid]?.name || aid;
      counts[aid] = counts[aid]
        ? { name, count: counts[aid].count + 1 }
        : { name, count: 1 };
    }
    return Object.entries(counts)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }, [allBuses, patternMap, agencyMap]);

  const routeOptions = useMemo(() => {
    const counts: Record<string, { title: string; count: number }> = {};
    for (const b of buses) {
      const pid = b["odpt:busroutePattern"];
      if (!pid) continue;
      const title =
        patternMap[pid]?.["dc:title"] || shortenPatternId(pid);
      counts[pid] = counts[pid]
        ? { title, count: counts[pid].count + 1 }
        : { title, count: 1 };
    }
    return Object.entries(counts)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.title.localeCompare(b.title, "ja"));
  }, [buses, patternMap]);

  const filtered = useMemo(() => {
    const list = routeFilter
      ? buses.filter((b) => b["odpt:busroutePattern"] === routeFilter)
      : buses;
    return [...list].sort((a, b) => {
      const da = a["odpt:delay"] ?? -Infinity;
      const db = b["odpt:delay"] ?? -Infinity;
      return db - da;
    });
  }, [buses, routeFilter]);

  return (
    <aside
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#0f172a",
        borderLeft: "1px solid #1e293b",
        color: "#f1f5f9",
      }}
    >
      <div style={{ padding: "16px 18px", borderBottom: "1px solid #1e293b" }}>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>
          現在運行中
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
          {stats.total}
          <span style={{ fontSize: 14, color: "#94a3b8", marginLeft: 6 }}>台</span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 8,
            marginTop: 12,
            fontSize: 11,
          }}
        >
          <StatBadge label="定時" count={stats.onTime} color="#22c55e" />
          <StatBadge label="軽微" count={stats.minor} color="#eab308" />
          <StatBadge label="遅延" count={stats.major} color="#ef4444" />
          <StatBadge label="早発" count={stats.early} color="#0ea5e9" />
        </div>
      </div>

      {agencyOptions.length > 0 && (
        <div style={{ padding: "12px 18px", borderBottom: "1px solid #1e293b" }}>
          <label
            style={{
              display: "block",
              fontSize: 11,
              color: "#94a3b8",
              marginBottom: 6,
            }}
          >
            営業所で絞り込み
          </label>
          <select
            value={agencyFilter}
            onChange={(e) => onChangeAgencyFilter(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 10px",
              background: "#1e293b",
              color: "#f1f5f9",
              border: "1px solid #334155",
              borderRadius: 6,
            }}
          >
            <option value="">すべての営業所 ({allBuses.length}台)</option>
            {agencyOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.count}台)
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={{ padding: "12px 18px", borderBottom: "1px solid #1e293b" }}>
        <label
          style={{
            display: "block",
            fontSize: 11,
            color: "#94a3b8",
            marginBottom: 6,
          }}
        >
          系統で絞り込み
        </label>
        <select
          value={routeFilter}
          onChange={(e) => onChangeRouteFilter(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 10px",
            background: "#1e293b",
            color: "#f1f5f9",
            border: "1px solid #334155",
            borderRadius: 6,
          }}
        >
          <option value="">すべて ({buses.length}台)</option>
          {routeOptions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title} ({r.count}台)
            </option>
          ))}
        </select>
      </div>

      <div style={{ overflowY: "auto", flex: 1 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>
            運行中のバスはありません
          </div>
        ) : (
          filtered.map((bus) => (
            <BusRow
              key={bus["@id"]}
              bus={bus}
              patternMap={patternMap}
              stopMap={stopMap}
              isSelected={bus["@id"] === selectedBusId}
              onClick={() =>
                onSelectBus(bus["@id"] === selectedBusId ? null : bus["@id"])
              }
            />
          ))
        )}
      </div>
    </aside>
  );
}

function StatBadge({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div
      style={{
        background: "#1e293b",
        borderRadius: 6,
        padding: "6px 4px",
        textAlign: "center",
        borderTop: `2px solid ${color}`,
      }}
    >
      <div style={{ color: "#94a3b8" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{count}</div>
    </div>
  );
}

function BusRow({
  bus,
  patternMap,
  stopMap,
  isSelected,
  onClick,
}: {
  bus: OdptBus;
  patternMap: Record<string, OdptBusroutePattern>;
  stopMap: Record<string, { title: string; lat?: number; lng?: number }>;
  isSelected: boolean;
  onClick: () => void;
}) {
  const delay = classifyDelay(bus["odpt:delay"]);
  const pid = bus["odpt:busroutePattern"];
  const title = (pid && patternMap[pid]?.["dc:title"]) || shortenPatternId(pid);
  const to = bus["odpt:toBusstopPole"];
  const toName = to ? stopMap[to]?.title || shortenStopId(to) : "—";

  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "10px 18px",
        borderBottom: "1px solid #1e293b",
        background: isSelected ? "#1e293b" : "transparent",
        transition: "background 120ms",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#f1f5f9",
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
            padding: "1px 6px",
            borderRadius: 999,
            background: delay.color,
            color: "#fff",
            fontSize: 10,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {delay.label}
        </span>
      </div>
      <div
        style={{
          fontSize: 11,
          color: "#94a3b8",
          marginTop: 2,
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
}

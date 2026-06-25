"use client";

import { useMemo } from "react";
import type { OdptBus, OdptBusroutePattern } from "@/app/types/odpt";
import { classifyDelay, shortenPatternId, shortenStopId } from "@/app/lib/format";

interface Props {
  displayedBuses: OdptBus[];
  patternMap: Record<string, OdptBusroutePattern>;
  stopMap: Record<string, { title: string; lat?: number; lng?: number }>;
  selectedBusId: string | null;
  onSelectBus: (id: string | null) => void;
}

export default function BusInfoPanel({
  displayedBuses,
  patternMap,
  stopMap,
  selectedBusId,
  onSelectBus,
}: Props) {
  const stats = useMemo(() => {
    let onTime = 0,
      minor = 0,
      major = 0,
      early = 0,
      unknown = 0;
    for (const b of displayedBuses) {
      const c = classifyDelay(b["odpt:delay"]).level;
      if (c === "ontime") onTime++;
      else if (c === "minor") minor++;
      else if (c === "major") major++;
      else if (c === "early") early++;
      else unknown++;
    }
    return {
      total: displayedBuses.length,
      onTime,
      minor,
      major,
      early,
      unknown,
    };
  }, [displayedBuses]);

  const sortedList = useMemo(
    () =>
      [...displayedBuses].sort((a, b) => {
        const da = a["odpt:delay"] ?? -Infinity;
        const db = b["odpt:delay"] ?? -Infinity;
        return db - da;
      }),
    [displayedBuses],
  );

  return (
    <aside
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: "#0f172a",
        borderLeft: "1px solid #1e293b",
        color: "#f1f5f9",
      }}
    >
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e293b" }}>
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
          表示中
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1 }}>
          {stats.total}
          <span style={{ fontSize: 13, color: "#94a3b8", marginLeft: 6 }}>
            台
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 6,
            marginTop: 10,
            fontSize: 11,
          }}
        >
          <StatBadge label="定時" count={stats.onTime} color="#22c55e" />
          <StatBadge label="軽微" count={stats.minor} color="#eab308" />
          <StatBadge label="遅延" count={stats.major} color="#ef4444" />
          <StatBadge label="早発" count={stats.early} color="#0ea5e9" />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {sortedList.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>
            該当するバスはありません
          </div>
        ) : (
          sortedList.map((bus) => (
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
      <div style={{ fontSize: 15, fontWeight: 700, color }}>{count}</div>
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
        padding: "10px 16px",
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
          {bus.tripHeadsign && (
            <span style={{ color: "#94a3b8", fontWeight: 400 }}>
              {" "}
              · {bus.tripHeadsign} 行
            </span>
          )}
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

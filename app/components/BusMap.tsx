"use client";

import { useEffect, useMemo } from "react";
import {
  AdvancedMarker,
  InfoWindow,
  Map,
  useMap,
} from "@vis.gl/react-google-maps";
import type { OdptBus, OdptBusroutePattern } from "@/app/types/odpt";
import { classifyDelay, shortenStopId } from "@/app/lib/format";

interface Props {
  buses: OdptBus[];
  patternMap: Record<string, OdptBusroutePattern>;
  stopMap: Record<string, { title: string; lat?: number; lng?: number }>;
  selectedBusId: string | null;
  onSelectBus: (id: string | null) => void;
  mapId: string;
  hideInfoWindow?: boolean;
}

const KEIO_CENTER = { lat: 35.6638, lng: 139.5286 };

export default function BusMap({
  buses,
  patternMap,
  stopMap,
  selectedBusId,
  onSelectBus,
  mapId,
  hideInfoWindow,
}: Props) {
  const selected = useMemo(
    () => buses.find((b) => b["@id"] === selectedBusId) || null,
    [buses, selectedBusId],
  );

  return (
    <Map
      mapId={mapId}
      defaultCenter={KEIO_CENTER}
      defaultZoom={11}
      gestureHandling="greedy"
      disableDefaultUI={false}
      clickableIcons={false}
      style={{ width: "100%", height: "100%" }}
    >
      <MapCenterer target={selected} />

      {buses.map((bus) => {
        const lat = bus["geo:lat"];
        const lng = bus["geo:long"];
        if (lat === undefined || lng === undefined) return null;

        const delay = classifyDelay(bus["odpt:delay"]);
        const bearing = bus["odpt:azimuth"] ?? 0;
        const isSelected = bus["@id"] === selectedBusId;

        return (
          <AdvancedMarker
            key={bus["@id"]}
            position={{ lat, lng }}
            onClick={() => onSelectBus(bus["@id"])}
            zIndex={isSelected ? 999 : 1}
          >
            <div
              style={{
                width: isSelected ? 32 : 26,
                height: isSelected ? 32 : 26,
                borderRadius: "50%",
                background: delay.color,
                border: `2px solid ${isSelected ? "#fde68a" : "#ffffff"}`,
                boxShadow: "0 2px 6px rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 700,
                fontSize: 16,
                transform: `rotate(${bearing}deg)`,
                transition: "all 200ms ease-out",
              }}
              title={`${shortenStopId(bus["odpt:toBusstopPole"])} 行`}
            >
              <span style={{ transform: "rotate(-45deg)", lineHeight: 1 }}>
                ▲
              </span>
            </div>
          </AdvancedMarker>
        );
      })}

      {!hideInfoWindow &&
        selected &&
        selected["geo:lat"] !== undefined &&
        selected["geo:long"] !== undefined && (
          <InfoWindow
            position={{ lat: selected["geo:lat"], lng: selected["geo:long"] }}
            pixelOffset={[0, -16]}
            onCloseClick={() => onSelectBus(null)}
          >
            <BusInfo bus={selected} patternMap={patternMap} stopMap={stopMap} />
          </InfoWindow>
        )}
    </Map>
  );
}

function MapCenterer({ target }: { target: OdptBus | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !target) return;
    const lat = target["geo:lat"];
    const lng = target["geo:long"];
    if (lat === undefined || lng === undefined) return;
    map.panTo({ lat, lng });
    if ((map.getZoom() ?? 11) < 14) map.setZoom(14);
  }, [map, target]);
  return null;
}

function BusInfo({
  bus,
  patternMap,
  stopMap,
}: {
  bus: OdptBus;
  patternMap: Record<string, OdptBusroutePattern>;
  stopMap: Record<string, { title: string; lat?: number; lng?: number }>;
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
    <div style={{ minWidth: 220, maxWidth: 280, color: "#0f172a" }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
        {pattern?.["dc:title"] || "系統情報なし"}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
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

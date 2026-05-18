"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  OdptBus,
  OdptBusroutePattern,
  OfficeEntry,
} from "@/app/types/odpt";

export type StopMap = Record<
  string,
  { title: string; lat?: number; lng?: number }
>;

const REFRESH_INTERVAL_MS = 30_000;

export interface BusData {
  buses: OdptBus[];
  patternMap: Record<string, OdptBusroutePattern>;
  stopMap: StopMap;
  officeMap: Record<string, OfficeEntry>;
  lastUpdated: Date | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useBusData(): BusData {
  const [buses, setBuses] = useState<OdptBus[]>([]);
  const [patternMap, setPatternMap] = useState<
    Record<string, OdptBusroutePattern>
  >({});
  const [stopMap, setStopMap] = useState<StopMap>({});
  const [officeMap, setOfficeMap] = useState<Record<string, OfficeEntry>>({});
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
      if (data.officeMap) setOfficeMap(data.officeMap);
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

  return {
    buses,
    patternMap,
    stopMap,
    officeMap,
    lastUpdated,
    loading,
    error,
    refresh: fetchBuses,
  };
}

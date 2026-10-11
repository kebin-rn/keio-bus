"use client";

import { useEffect, useState } from "react";
import type { RouteStop } from "@/app/lib/routeGeometry";

// 便の停留所列 (/api/trip) の取得。地図の経路表示と PC 版の到着予想の一覧で共有する。
// 停留所の並び・座標・定刻は便ごとに変わらないので、便ごとにキャッシュし、同じ便を
// 選び直しても取り直さない。到着予想は表示側でバスの現在位置・遅延から求める

export interface TripStops {
  tripId: string;
  stops: RouteStop[];
}

const CACHE_MAX = 50;
const stopsCache = new Map<string, TripStops>();
// 同じ便を同時に求められたとき (地図と到着予想の一覧など) は 1 回の要求にまとめる
const inflight = new Map<string, Promise<{ value: TripStops; complete: boolean }>>();
// 停留所列がキャッシュに入ったときの通知先 (取得に失敗して再試行待ちの一覧が、
// 地図側の取得で揃ったデータをすぐ使えるように)
const listeners = new Map<string, Set<(value: TripStops) => void>>();

export function remember<V>(cache: Map<string, V>, key: string, value: V) {
  cache.set(key, value);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

function loadTripStops(tripId: string) {
  const pending = inflight.get(tripId);
  if (pending) return pending;
  const request = (async () => {
    const res = await fetch(`/api/trip?id=${encodeURIComponent(tripId)}`, {
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok || !Array.isArray(data.stops)) throw new Error("trip");
    const value: TripStops = {
      tripId,
      stops: data.stops.map((s: RouteStop) => ({
        seq: s.seq,
        stopId: s.stopId,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        scheduledSec: s.scheduledSec,
      })),
    };
    // サーバーが静的 GTFS (停留所の座標) や時刻表を読めなかったときの
    // 不完全な停留所列は使い回さず、後で取り直す
    const complete =
      data.scheduleAvailable !== false &&
      value.stops.filter((s) => s.lat !== undefined && s.lng !== undefined).length >= 2;
    if (complete) {
      remember(stopsCache, tripId, value);
      listeners.get(tripId)?.forEach((notify) => notify(value));
    }
    return { value, complete };
  })().finally(() => inflight.delete(tripId));
  inflight.set(tripId, request);
  return request;
}

// failed: 取得に失敗して再試行を待っている (取得済みの停留所列があれば data はそのまま)
export function useTripStops(tripId: string | undefined): {
  data: TripStops | null;
  failed: boolean;
} {
  const [state, setState] = useState<{
    tripId: string;
    data: TripStops | null;
    failed: boolean;
  } | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!tripId) return;
    const cached = stopsCache.get(tripId);
    if (cached) {
      setState({ tripId, data: cached, failed: false });
      return;
    }
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onCached = (value: TripStops) => {
      if (!alive) return;
      if (timer) clearTimeout(timer);
      setState({ tripId, data: value, failed: false });
    };
    let subscribers = listeners.get(tripId);
    if (!subscribers) listeners.set(tripId, (subscribers = new Set()));
    subscribers.add(onCached);
    loadTripStops(tripId).then(
      ({ value, complete }) => {
        if (!alive) return;
        setState({ tripId, data: value, failed: false });
        // 不完全な停留所列は 1 分後に取り直す
        if (!complete) timer = setTimeout(() => setRetry((n) => n + 1), 60_000);
      },
      () => {
        if (!alive) return;
        // 一時的な失敗は 30 秒後に再試行
        setState((cur) => ({
          tripId,
          data: cur?.tripId === tripId ? cur.data : null,
          failed: true,
        }));
        timer = setTimeout(() => setRetry((n) => n + 1), 30_000);
      },
    );
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      subscribers.delete(onCached);
      if (subscribers.size === 0) listeners.delete(tripId);
    };
  }, [tripId, retry]);

  // 便が切り替わった直後は前の便の停留所列を使わない
  if (!tripId || !state || state.tripId !== tripId) return { data: null, failed: false };
  return { data: state.data, failed: state.failed };
}

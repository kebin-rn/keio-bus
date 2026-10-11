// 便の停留所列から「道路に沿った経路」を Google Routes API で求める中核処理。
// (Next.js に依存しない純粋な処理。キャッシュや環境変数の扱いは routeShape.ts)
//
// - 停留所を経由地点 (停車扱い) として順に指定し、停留所ごとに区切られた
//   区間 (leg) の経路を得る。区間ごとに道路形状が分かれるので、通過済み/
//   これからの塗り分けもそのまま区間単位でできる
// - Routes API の安い料金区分 (Essentials) は経由地点 10 個までなので、
//   停留所 12 個ずつ (始点 + 経由 10 + 終点) に分けて要求する
// - 停留所の位置には進行方向 (heading) を付ける。付けないと上下線の
//   反対側の車線に寄せられ、Uターンを含む経路が返ることがある
// - 返ってきた区間は検証し、Uターン・大回り・停留所から離れた経路は採用しない
//   (その区間は画面側で「おおよその経路」として点線表示する)

import { decodePolyline } from "./polyline";

export interface ShapePoint {
  stopId: string;
  lat: number;
  lng: number;
}

// 一時的な失敗・設定の誤り。結果をキャッシュせず、次回あらためて計算する
export class RoutesApiError extends Error {}

export const MAX_INTERMEDIATES = 10;
const STOPS_PER_REQUEST = MAX_INTERMEDIATES + 2;

// 区間の検証のしきい値
const MAX_SNAP_M = 150; // 経路の端点と停留所の距離
const MAX_BACKTRACK_M = 120; // 停留所間の進行方向に対して後戻りした距離 (Uターン検出)

function distM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function bearingDeg(a: ShapePoint, b: ShapePoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

// 各停留所での進行方向。始発は次の停留所へ向かう向き、それ以外は前の停留所から
// 到着する向き (停留所の柱は進行方向側の路肩にある)。停留所が近すぎて向きが
// 定まらない場合は付けない
export function stopHeadings(points: ShapePoint[]): (number | undefined)[] {
  return points.map((p, i) => {
    const [a, b] = i === 0 ? [p, points[1]] : [points[i - 1], p];
    if (!a || !b || distM(a, b) < 10) return undefined;
    return bearingDeg(a, b);
  });
}

// 要求の分割: [開始 index, 終了 index] (隣り合う要求は端の停留所を共有する)
export function chunkRanges(count: number): [number, number][] {
  const ranges: [number, number][] = [];
  for (let s = 0; s < count - 1; s += STOPS_PER_REQUEST - 1) {
    ranges.push([s, Math.min(s + STOPS_PER_REQUEST - 1, count - 1)]);
  }
  return ranges;
}

export function buildRequestBody(points: ShapePoint[], headings: (number | undefined)[]) {
  const waypoint = (p: ShapePoint, heading: number | undefined) => ({
    location: {
      latLng: { latitude: p.lat, longitude: p.lng },
      ...(heading !== undefined ? { heading } : {}),
    },
  });
  const last = points.length - 1;
  const intermediates = points
    .slice(1, last)
    .map((p, i) => waypoint(p, headings[i + 1]));
  return {
    origin: waypoint(points[0], headings[0]),
    destination: waypoint(points[last], headings[last]),
    ...(intermediates.length ? { intermediates } : {}),
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_UNAWARE",
    polylineQuality: "HIGH_QUALITY",
    polylineEncoding: "ENCODED_POLYLINE",
    // 一般の路線バスは高速道路・有料道路・フェリーを使わない
    routeModifiers: { avoidHighways: true, avoidTolls: true, avoidFerries: true },
    languageCode: "ja",
    regionCode: "jp",
    units: "METRIC",
  };
}

// 区間の経路が停留所間の実際のバス経路として妥当かを確かめ、妥当なら採用する
export function validateLeg(
  encoded: string | undefined,
  a: ShapePoint,
  b: ShapePoint,
): string | null {
  if (!encoded) return null;
  const pts = decodePolyline(encoded);
  if (pts.length < 2) return null;
  // 停留所から離れた道路に寄せられた経路は使わない
  if (distM(pts[0], a) > MAX_SNAP_M || distM(pts[pts.length - 1], b) > MAX_SNAP_M) {
    return null;
  }
  const straight = distM(a, b);
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += distM(pts[i - 1], pts[i]);
  // 大回り (反対車線に入るための迂回など) は使わない
  if (length > straight * 3 + 500) return null;
  // Uターン: 停留所 a→b の方向に対して大きく後戻りしていないか
  if (straight >= 30) {
    const cosLat = Math.cos((a.lat * Math.PI) / 180);
    const ux = (b.lng - a.lng) * cosLat;
    const uy = b.lat - a.lat;
    const norm = Math.hypot(ux, uy);
    let maxProgress = -Infinity;
    for (const p of pts) {
      // 経度・緯度の差を a→b 方向へ射影し、メートルに直す
      const progress =
        (((p.lng - a.lng) * cosLat * ux + (p.lat - a.lat) * uy) / norm) * 111_320;
      if (progress < maxProgress - MAX_BACKTRACK_M) return null;
      if (progress > maxProgress) maxProgress = progress;
    }
  }
  return encoded;
}

export interface RoutesDeps {
  apiKey: string;
  url: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}

async function requestChunk(
  points: ShapePoint[],
  headings: (number | undefined)[],
  deps: RoutesDeps,
): Promise<(string | null)[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
  let res: Response;
  let data: { routes?: { legs?: { polyline?: { encodedPolyline?: string } }[] }[] };
  try {
    res = await deps.fetchImpl(deps.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": deps.apiKey,
        "X-Goog-FieldMask": "routes.legs.polyline.encodedPolyline,routes.legs.distanceMeters",
      },
      body: JSON.stringify(buildRequestBody(points, headings)),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // 認証・権限・リクエストの誤り・上限超過・障害はいずれも結果を残さない
      throw new RoutesApiError(`Routes API ${res.status}: ${body.slice(0, 300)}`);
    }
    data = await res.json();
  } catch (e) {
    if (e instanceof RoutesApiError) throw e;
    throw new RoutesApiError(
      controller.signal.aborted
        ? `Routes API timeout (${deps.timeoutMs}ms)`
        : `Routes API fetch error: ${e instanceof Error ? e.message : e}`,
    );
  } finally {
    clearTimeout(timer);
  }

  const legs = data.routes?.[0]?.legs;
  // 経路が見つからない (道路から遠い停留所など) 場合は、この範囲を全区間
  // おおよその経路として扱う
  if (!legs || legs.length !== points.length - 1) {
    return Array(points.length - 1).fill(null);
  }
  return legs.map((leg, i) =>
    validateLeg(leg.polyline?.encodedPolyline, points[i], points[i + 1]),
  );
}

// 停留所 n 個 → 区間 n-1 個の経路 (encoded polyline、採用しない区間は null)
export async function computeShapeLegs(
  points: ShapePoint[],
  deps: RoutesDeps,
): Promise<(string | null)[]> {
  if (points.length < 2) return [];
  const headings = stopHeadings(points);
  const parts = await Promise.all(
    chunkRanges(points.length).map(([s, e]) =>
      requestChunk(points.slice(s, e + 1), headings.slice(s, e + 1), deps),
    ),
  );
  return parts.flat();
}

export function requestCount(stopCount: number): number {
  return chunkRanges(stopCount).length;
}

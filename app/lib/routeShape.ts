// 便の経路形状 (道路に沿った線) の取得とキャッシュ。
//
// 経路の計算は Google Routes API を使う (routeShapeCore.ts)。同じ停留所列 (系統の
// 運行パターン) の結果は Next.js のデータキャッシュに 7 日間保存し、インスタンスや
// デプロイをまたいで使い回す。京王バスの運行パターンは 600 弱 (停留所は平均 14 か所)
// で、すべて一巡しても 600 件程度の要求で済み、毎週計算し直しても Routes API の
// 無料枠 (Pro: 月 5,000 件) に収まる。
//
// GOOGLE_ROUTES_API_KEY が未設定なら経路形状は返さず、地図側は停留所を結んだ
// 「おおよその経路」(点線) で表示する。

import { unstable_cache } from "next/cache";
import {
  computeShapeLegs,
  requestCount,
  RoutesApiError,
  type ShapePoint,
} from "./routeShapeCore";

const ROUTES_API_URL =
  // テスト用に差し替えられるようにしている (通常は設定しない)
  process.env.GOOGLE_ROUTES_API_URL ||
  "https://routes.googleapis.com/directions/v2:computeRoutes";
const REVALIDATE_SEC = 7 * 24 * 60 * 60;
// 1 インスタンスあたり 1 時間の要求数の上限。キャッシュが効かない状況でも
// 料金が膨らまないようにするための安全弁 (通常はキャッシュでほぼ使わない)
const HOURLY_REQUEST_BUDGET = 200;

export function routesApiConfigured(): boolean {
  return Boolean(process.env.GOOGLE_ROUTES_API_KEY);
}

let budgetWindowStart = 0;
let budgetUsed = 0;
function consumeBudget(requests: number) {
  const now = Date.now();
  if (now - budgetWindowStart > 60 * 60 * 1000) {
    budgetWindowStart = now;
    budgetUsed = 0;
  }
  if (budgetUsed + requests > HOURLY_REQUEST_BUDGET) {
    throw new RoutesApiError("Routes API の 1 時間あたりの要求上限に達しました");
  }
  budgetUsed += requests;
}

// 引数 (停留所 ID と座標の列) がそのままキャッシュのキーになる。
// 失敗 (RoutesApiError) は例外になるのでキャッシュされない
const cachedShapeLegs = unstable_cache(
  async (points: ShapePoint[]): Promise<(string | null)[]> => {
    const apiKey = process.env.GOOGLE_ROUTES_API_KEY;
    if (!apiKey) throw new RoutesApiError("GOOGLE_ROUTES_API_KEY is not set");
    consumeBudget(requestCount(points.length));
    return computeShapeLegs(points, {
      apiKey,
      url: ROUTES_API_URL,
      fetchImpl: fetch,
      timeoutMs: 10_000,
    });
  },
  ["route-shape", "v1"],
  { revalidate: REVALIDATE_SEC },
);

// 同じインスタンス内では計算中・計算済みの結果を共有する。データキャッシュの
// 再計算 (REVALIDATE_SEC) が効くよう、1 時間たったらデータキャッシュから引き直す
const memo = new Map<string, { at: number; legs: Promise<(string | null)[]> }>();
const MEMO_MAX = 300;
const MEMO_TTL_MS = 60 * 60 * 1000;

export function getShapeLegs(points: ShapePoint[]): Promise<(string | null)[]> {
  const key = points
    .map((p) => `${p.stopId}@${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
    .join(">");
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < MEMO_TTL_MS) return hit.legs;
  const entry = { at: Date.now(), legs: cachedShapeLegs(points) };
  memo.delete(key);
  memo.set(key, entry);
  entry.legs.catch(() => {
    if (memo.get(key) === entry) memo.delete(key);
  });
  if (memo.size > MEMO_MAX) {
    const oldest = memo.keys().next().value;
    if (oldest !== undefined) memo.delete(oldest);
  }
  return entry.legs;
}

export { RoutesApiError };

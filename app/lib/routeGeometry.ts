// 地図に描く便の経路を、停留所列・区間ごとの道路形状・バスの現在位置から組み立てる。
//
// - 区間 (隣り合う停留所の間) ごとに、道路に沿った形状 (/api/shape) があれば
//   それを使い、無ければ停留所を直線で結んだ「おおよその経路」とする
// - バスが走っている区間はバスの位置で分け、通過済み側とこれから側を塗り分ける
// - 同じ種類 (通過済み/これから × 道路/おおよそ) が続く区間は 1 本の線にまとめる

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteStop {
  seq: number;
  stopId: string;
  name: string | null;
  lat?: number;
  lng?: number;
  scheduledSec?: number;
}

export type RouteStopState = "passed" | "current" | "upcoming";

export interface RouteDot extends LatLng {
  seq: number;
  name: string | null;
  scheduledSec?: number;
  state: RouteStopState;
  isOrigin: boolean;
  isTerminal: boolean;
}

export interface RouteRun {
  part: "passed" | "upcoming";
  road: boolean; // 道路に沿った形状か (false なら停留所を結んだおおよその経路)
  path: LatLng[];
}

export interface RouteGeometry {
  runs: RouteRun[];
  dots: RouteDot[];
  // これから走る範囲 (バスの現在地 + これからの経路)。選択時の表示範囲に使う
  remainingPoints: LatLng[];
}

// 区間 (fromSeq→toSeq) ごとの道路形状
export type SegmentShapes = Map<string, LatLng[]>;
export const segmentKey = (fromSeq: number, toSeq: number) => `${fromSeq}-${toSeq}`;

// 点 p に最も近い経路上の点 (経路を構成する線分の index と、その上の点)
export function projectOnPath(path: LatLng[], p: LatLng): { index: number; point: LatLng } {
  const cos = Math.cos((p.lat * Math.PI) / 180);
  let best = { d: Infinity, index: 0, point: path[0] };
  for (let i = 0; i < path.length - 1; i++) {
    const ax = path[i].lng * cos;
    const ay = path[i].lat;
    const dx = path[i + 1].lng * cos - ax;
    const dy = path[i + 1].lat - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((p.lng * cos - ax) * dx + (p.lat - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + t * dx;
    const qy = ay + t * dy;
    const d = (p.lng * cos - qx) ** 2 + (p.lat - qy) ** 2;
    if (d < best.d) best = { d, index: i, point: { lat: qy, lng: qx / cos } };
  }
  return { index: best.index, point: best.point };
}

export function buildRouteGeometry(
  stops: RouteStop[],
  currentSeq: number,
  beforeDeparture: boolean,
  bus: LatLng | null,
  shapes: SegmentShapes | null,
): RouteGeometry {
  const ordered = [...stops].sort((a, b) => a.seq - b.seq);
  const firstSeq = ordered[0]?.seq;
  const lastSeq = ordered[ordered.length - 1]?.seq;

  const dots: RouteDot[] = [];
  for (const s of ordered) {
    // 静的 GTFS に無い停留所は座標が無いので線から外す (前後の停留所を直接結ぶ)
    if (s.lat === undefined || s.lng === undefined) continue;
    dots.push({
      seq: s.seq,
      lat: s.lat,
      lng: s.lng,
      name: s.name,
      scheduledSec: s.scheduledSec,
      state:
        s.seq < currentSeq ? "passed" : s.seq === currentSeq ? "current" : "upcoming",
      isOrigin: s.seq === firstSeq,
      isTerminal: s.seq === lastSeq,
    });
  }

  // バスが向かっている停留所 (最初の未通過の停留所)。発車前は経路全体が「これから」
  const nextIdx = beforeDeparture ? 0 : dots.findIndex((d) => d.state !== "passed");

  const pieces: RouteRun[] = [];
  for (let i = 0; i < dots.length - 1; i++) {
    const a = dots[i];
    const b = dots[i + 1];
    const shape = shapes?.get(segmentKey(a.seq, b.seq));
    const road = !!shape && shape.length >= 2;
    const path: LatLng[] = road ? shape! : [a, b];

    if (nextIdx === -1 || i + 1 < nextIdx) {
      // 両端とも通過済み
      pieces.push({ part: "passed", road, path });
    } else if (i + 1 === nextIdx && bus) {
      // バスが走っている区間: バスの位置で分ける
      const { index, point } = projectOnPath(path, bus);
      pieces.push({ part: "passed", road, path: [...path.slice(0, index + 1), point] });
      pieces.push({ part: "upcoming", road, path: [point, ...path.slice(index + 1)] });
    } else {
      pieces.push({ part: "upcoming", road, path });
    }
  }

  const runs: RouteRun[] = [];
  for (const piece of pieces) {
    const prev = runs[runs.length - 1];
    if (prev && prev.part === piece.part && prev.road === piece.road) {
      const last = prev.path[prev.path.length - 1];
      const head = piece.path[0];
      const joined =
        last.lat === head.lat && last.lng === head.lng ? piece.path.slice(1) : piece.path;
      prev.path = [...prev.path, ...joined];
    } else {
      runs.push({ ...piece, path: [...piece.path] });
    }
  }

  const upcoming = runs.filter((r) => r.part === "upcoming").flatMap((r) => r.path);
  const remainingPoints = bus ? [bus, ...upcoming] : upcoming;

  return { runs, dots, remainingPoints };
}

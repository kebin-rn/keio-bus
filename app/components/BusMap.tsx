"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  Map,
  Polyline,
  useMap,
} from "@vis.gl/react-google-maps";
import type { OdptBus } from "@/app/types/odpt";
import { classifyDelay, formatEtaSec, shortenStopId } from "@/app/lib/format";
import { decodePolyline } from "@/app/lib/polyline";
import {
  buildRouteGeometry,
  segmentKey,
  type LatLng,
  type RouteDot,
  type RouteGeometry,
  type RouteRun,
  type SegmentShapes,
} from "@/app/lib/routeGeometry";
import { busStatusText, relativeArrivalLabel } from "@/app/lib/stopStatus";
import { remember, useTripStops } from "@/app/hooks/useTripStops";

export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface Props {
  buses: OdptBus[];
  selectedBusId: string | null;
  onSelectBus: (id: string | null) => void;
  mapId: string;
  // 選択した便の経路に表示範囲を合わせるときの余白。地図に重ねて表示する
  // バスの情報カードに隠れる部分を含める
  fitPadding?: MapPadding;
  // 選んだ便の経路 (線・停留所の点・終点名) を表示するか。オフの間は BusMap からは
  // 経路の情報 (/api/trip・/api/shape) を取得しない (PC 版の到着予想の一覧は
  // ページ側で取得する)
  showRoute?: boolean;
  // 選んでいる停留所 (点を押すと名前と時刻の札が出る)。ページ側で持つ場合に渡す
  // (PC 版: 到着予想の一覧と地図の点を連動させる)。渡さなければ BusMap の中で持つ
  stopFocus?: StopFocus | null;
  onStopFocusChange?: (focus: StopFocus | null) => void;
}

// 選んでいる停留所。from は選んだ場所 (一覧から選んだときは、点が見えるよう地図を動かす)
export interface StopFocus {
  seq: number;
  from: "map" | "list";
}

// 表示範囲を合わせるときに、点の周りに確保する画面上の余白 (px)
interface Clearance {
  point: LatLng;
  above?: number;
  below?: number;
  left?: number;
  right?: number;
}

interface FitTarget {
  points: LatLng[];
  clearances: Clearance[];
}

const KEIO_CENTER = { lat: 35.6638, lng: 139.5286 };
const DEFAULT_FIT_PADDING: MapPadding = { top: 60, right: 60, bottom: 60, left: 60 };
export const ROUTE_COLOR = "#1a73e8";
const PASSED_COLOR = "#94a3b8";
// 道路形状の到着を待つ時間。キャッシュ済みならすぐ届くので、その間に直線の
// おおよその経路を一瞬描いてから差し替わる、というちらつきを避ける
const SHAPE_GRACE_MS = 1500;

export default function BusMap({
  buses,
  selectedBusId,
  onSelectBus,
  mapId,
  fitPadding = DEFAULT_FIT_PADDING,
  showRoute = true,
  stopFocus,
  onStopFocusChange,
}: Props) {
  const selected = useMemo(
    () => buses.find((b) => b["@id"] === selectedBusId) || null,
    [buses, selectedBusId],
  );

  // 経路表示がオフの間は便を渡さない (経路の情報を取得せず、何も描かない)
  const tripId = showRoute ? selected?.tripId : undefined;
  const tripStops = useTripStops(tripId).data;
  const shape = useTripShapes(tripId);
  const graceOver = useGraceTimer(tripId);
  const showLines = shape.status !== "loading" || graceOver;

  // 選んでいる停留所。ページ側で持つ場合 (onStopFocusChange あり) は、選択の
  // 切り替え時などの解除もページ側で行う
  const controlled = onStopFocusChange !== undefined;
  const [innerSeq, setInnerSeq] = useState<number | null>(null);
  useEffect(() => setInnerSeq(null), [selectedBusId, tripId]);
  const focusedSeq = controlled ? (stopFocus?.seq ?? null) : innerSeq;
  const changeFocus = (seq: number | null) => {
    if (onStopFocusChange) onStopFocusChange(seq === null ? null : { seq, from: "map" });
    else setInnerSeq(seq);
  };

  const geometry = useMemo(() => {
    if (!selected || !tripStops || selected.stopSeq === undefined) return null;
    const lat = selected["geo:lat"];
    const lng = selected["geo:long"];
    return buildRouteGeometry(
      tripStops.stops,
      selected.stopSeq,
      selected.beforeDeparture ?? false,
      lat !== undefined && lng !== undefined ? { lat, lng } : null,
      shape.status === "ready" ? shape.shapes : null,
    );
  }, [selected, tripStops, shape]);

  // 選択時に表示範囲を合わせる対象: これから走る経路 (線を描き始めてから合わせる)。
  // 終点名の札が画面からはみ出さないよう、その分の余白も確保する
  const fitTarget = useMemo<FitTarget | null>(() => {
    if (!geometry || !showLines || geometry.remainingPoints.length < 2) return null;
    const terminal = geometry.dots.find((d) => d.isTerminal);
    return {
      points: geometry.remainingPoints,
      clearances: terminal ? [terminalChipClearance(terminal)] : [],
    };
  }, [geometry, showLines]);

  return (
    <Map
      mapId={mapId}
      defaultCenter={KEIO_CENTER}
      defaultZoom={11}
      gestureHandling="greedy"
      disableDefaultUI={false}
      clickableIcons={false}
      onClick={() => changeFocus(null)}
      style={{ width: "100%", height: "100%" }}
    >
      <SelectionCamera
        selectedId={selectedBusId}
        bus={selected}
        target={fitTarget}
        padding={fitPadding}
      />

      {controlled && (
        <FocusReveal
          focus={stopFocus ?? null}
          dot={geometry?.dots.find((d) => d.seq === stopFocus?.seq) ?? null}
          padding={fitPadding}
        />
      )}

      {geometry && selected && (
        <RouteOverlay
          geometry={geometry}
          showLines={showLines}
          bus={selected}
          focusedSeq={focusedSeq}
          onFocusStop={(seq) => changeFocus(focusedSeq === seq ? null : seq)}
        />
      )}

      {buses.map((bus) => {
        const lat = bus["geo:lat"];
        const lng = bus["geo:long"];
        if (lat === undefined || lng === undefined) return null;

        const delay = classifyDelay(bus["odpt:delay"]);
        const bearing = bus["odpt:azimuth"] ?? 0;
        const isSelected = bus["@id"] === selectedBusId;
        // 便を選んでいる間は他のバスを薄くして、選んだ便と経路を見やすくする
        // (経路表示がオフでも、選んだバスの目印として薄くする。選んだバスが
        // 地図から消えたときは元に戻す)
        const dimmed = selected !== null && !isSelected;

        return (
          <AdvancedMarker
            key={bus["@id"]}
            position={{ lat, lng }}
            // マーカーの中心をバスの位置に合わせる (経路の線がマーカーの中心を通る)
            anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
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
                opacity: dimmed ? 0.35 : 1,
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
    </Map>
  );
}

// ---------------------------------------------------------------------------
// 便の道路形状の取得 (便ごとにキャッシュし、同じ便を選び直しても再取得しない)。
// 停留所列の取得 (useTripStops) は PC 版の到着予想の一覧と共有する

type ShapeState =
  | { tripId: string | undefined; status: "loading" }
  | { tripId: string | undefined; status: "ready"; shapes: SegmentShapes }
  | { tripId: string | undefined; status: "none" }; // 道路形状なし (おおよその経路で表示)

const shapesCache = new globalThis.Map<string, SegmentShapes>();
// サーバーに Routes API のキーが無い場合は以後問い合わせない
let routesUnavailable = false;

function useTripShapes(tripId: string | undefined): ShapeState {
  const [state, setState] = useState<ShapeState>({ tripId, status: "loading" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!tripId) return;
    if (routesUnavailable) {
      setState({ tripId, status: "none" });
      return;
    }
    const cached = shapesCache.get(tripId);
    if (cached) {
      setState({ tripId, status: "ready", shapes: cached });
      return;
    }
    setState({ tripId, status: "loading" });
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        const res = await fetch(`/api/shape?trip=${encodeURIComponent(tripId)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (res.ok && data.available === false) {
          routesUnavailable = true;
          if (alive) setState({ tripId, status: "none" });
          return;
        }
        if (!res.ok || !Array.isArray(data.segments)) throw new Error("shape");
        const shapes: SegmentShapes = new globalThis.Map();
        for (const seg of data.segments as {
          fromSeq: number;
          toSeq: number;
          path: string | null;
        }[]) {
          if (seg.path) shapes.set(segmentKey(seg.fromSeq, seg.toSeq), decodePolyline(seg.path));
        }
        remember(shapesCache, tripId, shapes);
        if (alive) setState({ tripId, status: "ready", shapes });
      } catch {
        // 取得できない間はおおよその経路で表示し、1 分後に再試行
        if (alive) {
          setState({ tripId, status: "none" });
          timer = setTimeout(() => setRetry((n) => n + 1), 60_000);
        }
      }
    })();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [tripId, retry]);
  // 便が切り替わった直後は前の便の形状を使わない
  return state.tripId === tripId ? state : { tripId, status: "loading" };
}

function useGraceTimer(tripId: string | undefined): boolean {
  const [over, setOver] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!tripId) return;
    const t = setTimeout(() => setOver(tripId), SHAPE_GRACE_MS);
    return () => clearTimeout(t);
  }, [tripId]);
  return over === tripId;
}

// ---------------------------------------------------------------------------
// 表示範囲: 便を選んだときに一度だけ、これから走る経路が収まるように合わせる。
// 30 秒ごとの更新では動かさない (経路を見ている途中で地図が勝手に動かないように)

function SelectionCamera({
  selectedId,
  bus,
  target,
  padding,
}: {
  selectedId: string | null;
  bus: OdptBus | null; // 選んだバス (地図に表示中でなければ null)
  target: FitTarget | null;
  padding: MapPadding;
}) {
  const map = useMap();
  const state = useRef({ id: null as string | null, fitted: false, userMoved: false });

  useEffect(() => {
    if (!map) return;
    const listener = map.addListener("dragstart", () => {
      state.current.userMoved = true;
    });
    return () => listener.remove();
  }, [map]);

  // 選択が変わったときだけ状態を戻す (選んだバスが更新で一時的に消えて
  // 戻ってきても、選び直したことにはしない)
  useEffect(() => {
    if (!map) return;
    if (selectedId !== state.current.id) {
      state.current = { id: selectedId, fitted: false, userMoved: false };
      if (!selectedId) return;
      if (target) {
        fitToTarget(map, target, padding);
        state.current.fitted = true;
        return;
      }
      // 経路が届くまではバスの位置へ
      const lat = bus?.["geo:lat"];
      const lng = bus?.["geo:long"];
      if (lat !== undefined && lng !== undefined) {
        map.panTo({ lat, lng });
        if ((map.getZoom() ?? 11) < 14) map.setZoom(14);
      }
      return;
    }
    // 経路が後から届いた: 利用者がまだ地図を動かしていなければ合わせる
    if (selectedId && target && !state.current.fitted && !state.current.userMoved) {
      fitToTarget(map, target, padding);
      state.current.fitted = true;
    }
  }, [map, selectedId, bus, target, padding]);

  return null;
}

// 範囲は最小でもこの大きさ (約 450m 四方) にする。終点の手前で寄りすぎないように
const MIN_SPAN_LAT = 0.004;
const MIN_SPAN_LNG = 0.005;

function fitToTarget(map: google.maps.Map, target: FitTarget, padding: MapPadding) {
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  for (const p of target.points) {
    north = Math.max(north, p.lat);
    south = Math.min(south, p.lat);
    east = Math.max(east, p.lng);
    west = Math.min(west, p.lng);
  }
  if (north - south < MIN_SPAN_LAT) {
    const c = (north + south) / 2;
    north = c + MIN_SPAN_LAT / 2;
    south = c - MIN_SPAN_LAT / 2;
  }
  if (east - west < MIN_SPAN_LNG) {
    const c = (east + west) / 2;
    east = c + MIN_SPAN_LNG / 2;
    west = c - MIN_SPAN_LNG / 2;
  }
  const bounds = { north, south, east, west };
  const div = map.getDiv();
  map.fitBounds(
    bounds,
    paddingWithClearance(bounds, div.clientWidth, div.clientHeight, padding, target.clearances),
  );
}

// 範囲の端にある点 (終点名の札など) の周りに必要な余白が取れるよう
// padding を広げる。点の画面上の位置は、範囲が padding の内側いっぱいに
// 収まるものとして見積もる (実際は内側に小さめに・中央寄せで収まるので安全側)
function paddingWithClearance(
  b: { north: number; south: number; east: number; west: number },
  width: number,
  height: number,
  base: MapPadding,
  clearances: Clearance[],
): MapPadding {
  if (width <= 0 || height <= 0) return base;
  const p = { ...base };
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  // 上下・左右の余白は互いに影響するので、数回くり返して収束させる
  for (let round = 0; round < 3; round++) {
    for (const c of clearances) {
      const fx = clamp01((c.point.lng - b.west) / (b.east - b.west));
      const fy = clamp01((b.north - c.point.lat) / (b.north - b.south));
      const x = p.left + fx * (width - p.left - p.right);
      const y = p.top + fy * (height - p.top - p.bottom);
      // padding を d 広げると点は d × (反対側への比率) だけ内側へ寄る
      if (c.above && y < c.above) p.top += (c.above - y) / Math.max(1 - fy, 0.2);
      if (c.below && height - y < c.below) p.bottom += (c.below - (height - y)) / Math.max(fy, 0.2);
      if (c.left && x < c.left) p.left += (c.left - x) / Math.max(1 - fx, 0.2);
      if (c.right && width - x < c.right) p.right += (c.right - (width - x)) / Math.max(fx, 0.2);
    }
  }
  return capPadding(p, width, height);
}

// 地図が小さいときは経路を描く領域が残るよう、余白を縮める (上下・左右それぞれ地図の 3/4 まで)
function capPadding(p: MapPadding, width: number, height: number): MapPadding {
  const scale = (a: number, z: number, size: number) =>
    a + z > size * 0.75 ? (size * 0.75) / (a + z) : 1;
  const sy = scale(p.top, p.bottom, height);
  const sx = scale(p.left, p.right, width);
  return { top: p.top * sy, bottom: p.bottom * sy, left: p.left * sx, right: p.right * sx };
}

// 一覧から停留所を選んだとき、その点 (と上に出る名前の札) が地図の見える範囲に
// 無ければ、最小限だけ地図を動かす。縮尺は変えない。選ぶたびに 1 回だけ動かし、
// 点がまだ描かれていなければ描かれたときに動かす
function FocusReveal({
  focus,
  dot,
  padding,
}: {
  focus: StopFocus | null;
  dot: LatLng | null;
  padding: MapPadding;
}) {
  const map = useMap();
  const revealed = useRef<StopFocus | null>(null);
  useEffect(() => {
    if (!map || !focus || focus.from !== "list" || !dot) return;
    if (revealed.current === focus) return;
    revealed.current = focus;
    const div = map.getDiv();
    // 札は点の上に出る (高さ 50px 程度・幅は名前次第で左右 100px 程度)
    map.panToBounds(
      { north: dot.lat, south: dot.lat, east: dot.lng, west: dot.lng },
      capPadding(
        {
          top: padding.top + 56,
          right: padding.right + 100,
          bottom: padding.bottom,
          left: padding.left + 100,
        },
        div.clientWidth,
        div.clientHeight,
      ),
    );
  }, [map, focus, dot, padding]);
  return null;
}

// 終点名の札は点の右側に出る (文字幅は全角 1 文字 13px 程度で見積もる)
function terminalChipClearance(d: RouteDot): Clearance {
  const name = d.name ?? "停留所名不明";
  return { point: d, right: 36 + 13 * name.length };
}

// ---------------------------------------------------------------------------
// 経路の描画

function RouteOverlay({
  geometry,
  showLines,
  bus,
  focusedSeq,
  onFocusStop,
}: {
  geometry: RouteGeometry;
  showLines: boolean;
  bus: OdptBus;
  focusedSeq: number | null;
  onFocusStop: (seq: number) => void;
}) {
  const currentSeq = bus.stopSeq ?? 0;
  const beforeDeparture = bus.beforeDeparture ?? false;
  const delay = bus["odpt:delay"] ?? 0;
  const terminal = geometry.dots.find((d) => d.isTerminal);
  const focused = geometry.dots.find((d) => d.seq === focusedSeq);

  return (
    <>
      {showLines &&
        geometry.runs.map((run, i) => (
          // 種類 (通過済み/これから × 道路/おおよそ) ごとに Polyline を分ける。
          // setOptions は渡さなかった設定を消さないため、使い回すと点線が残る
          <RouteLine key={`${run.part}-${run.road ? "road" : "approx"}-${i}`} run={run} />
        ))}

      {geometry.dots.map((d) => (
        <AdvancedMarker
          key={d.seq}
          position={{ lat: d.lat, lng: d.lng }}
          anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
          zIndex={d.isTerminal || d.isOrigin ? 3 : 2}
          title={stopTooltip(d, delay)}
          onClick={() => onFocusStop(d.seq)}
        >
          <StopDot dot={d} />
        </AdvancedMarker>
      ))}

      {/* 終点の名前は常に表示 (行き先が分かるように) */}
      {terminal && terminal.seq !== focusedSeq && (
        <AdvancedMarker
          position={{ lat: terminal.lat, lng: terminal.lng }}
          anchorPoint={AdvancedMarkerAnchorPoint.LEFT_CENTER}
          zIndex={4}
          clickable={false}
        >
          <div style={{ paddingLeft: 12, pointerEvents: "none" }}>
            <div style={chipStyle}>{terminal.name ?? "停留所名不明"}</div>
          </div>
        </AdvancedMarker>
      )}

      {/* タップした停留所の名前と時刻 */}
      {focused && (
        <AdvancedMarker
          position={{ lat: focused.lat, lng: focused.lng }}
          anchorPoint={AdvancedMarkerAnchorPoint.BOTTOM_CENTER}
          zIndex={1000}
          clickable={false}
        >
          <div style={{ paddingBottom: 12, pointerEvents: "none" }}>
            <div style={{ ...chipStyle, textAlign: "center" }}>
              <div>{focused.name ?? "停留所名不明"}</div>
              <div style={{ fontSize: 11, fontWeight: 400, color: "#475569", marginTop: 1 }}>
                {stopTimeText(focused, currentSeq, beforeDeparture, bus.stopped ?? false, delay)}
              </div>
            </div>
          </div>
        </AdvancedMarker>
      )}
    </>
  );
}

const chipStyle: React.CSSProperties = {
  background: "#ffffff",
  color: "#0f172a",
  fontSize: 12,
  fontWeight: 700,
  padding: "4px 8px",
  borderRadius: 6,
  boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
  whiteSpace: "nowrap",
};

function RouteLine({ run }: { run: RouteRun }) {
  const passed = run.part === "passed";
  const color = passed ? PASSED_COLOR : ROUTE_COLOR;
  // これから側を通過済み側より上に描く (折り返しで重なる区間のため)
  const z = passed ? 1 : 3;

  if (!run.road) {
    // 道路形状の無い区間は、停留所を結んだおおよその経路として点線で描く
    const dash = (strokeColor: string, weight: number): google.maps.IconSequence => ({
      icon: { path: "M 0,-1 0,1", strokeColor, strokeOpacity: 1, strokeWeight: weight, scale: 3 },
      offset: "0",
      repeat: "12px",
    });
    return (
      <>
        <Polyline path={run.path} strokeOpacity={0} icons={[dash("#ffffff", 7)]} zIndex={z} clickable={false} />
        <Polyline path={run.path} strokeOpacity={0} icons={[dash(color, 4)]} zIndex={z + 1} clickable={false} />
      </>
    );
  }
  return (
    <>
      <Polyline
        path={run.path}
        strokeColor="#ffffff"
        strokeOpacity={passed ? 0.8 : 1}
        strokeWeight={passed ? 7 : 9}
        zIndex={z}
        clickable={false}
      />
      <Polyline
        path={run.path}
        strokeColor={color}
        strokeOpacity={1}
        strokeWeight={passed ? 4 : 5}
        zIndex={z + 1}
        clickable={false}
      />
    </>
  );
}

function StopDot({ dot }: { dot: RouteDot }) {
  const passed = dot.state === "passed";
  const big = dot.isOrigin || dot.isTerminal;
  const size = big ? 14 : passed ? 8 : 10;
  return (
    // 指でタップしやすいよう、見た目より広い範囲をタップ可能にする
    <div
      style={{
        width: 24,
        height: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: passed ? "#e2e8f0" : "#ffffff",
          border: `${big ? 3 : 2}px solid ${passed ? PASSED_COLOR : ROUTE_COLOR}`,
          boxShadow: "0 0 0 1px rgba(255,255,255,0.8)",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

// 停留所の時刻の表示。これから通る停留所は到着予想 (定刻 + 現在の遅延) と相対時間
function stopTimeText(
  d: RouteDot,
  currentSeq: number,
  beforeDeparture: boolean,
  stopped: boolean,
  delaySec: number,
): string {
  if (d.state === "passed") return "通過済み";
  const predicted =
    d.scheduledSec !== undefined ? formatEtaSec(d.scheduledSec + delaySec) : null;
  if (d.state === "current") {
    const status = busStatusText(beforeDeparture, stopped);
    if (beforeDeparture && d.isOrigin && predicted) return `${predicted} 発車予定 · ${status}`;
    return predicted ? `${predicted} · ${status}` : status;
  }
  const relative = relativeArrivalLabel({
    stopsAhead: d.seq - currentSeq,
    beforeDeparture,
    predictedSec: d.scheduledSec !== undefined ? d.scheduledSec + delaySec : undefined,
  });
  const parts = [predicted ? `${predicted} 着予定` : null, relative].filter(Boolean);
  return parts.length ? parts.join(" · ") : "時刻不明";
}

function stopTooltip(d: RouteDot, delaySec: number): string {
  const name = d.name ?? "停留所名不明";
  if (d.state === "passed") return `${name} (通過済み)`;
  const predicted =
    d.scheduledSec !== undefined ? formatEtaSec(d.scheduledSec + delaySec) : null;
  return predicted ? `${name} ${predicted}` : name;
}

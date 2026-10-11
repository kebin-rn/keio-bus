// Google の Encoded Polyline (精度 1e-5) の変換。
// Routes API が返す経路はこの形式で、サーバー→ブラウザもこの形式で送る
// (座標の配列で送るより数分の一の大きさになる)。

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export function decodePolyline(encoded: string): LatLngPoint[] {
  const points: LatLngPoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const axis of [0, 1]) {
      let result = 0;
      let shift = 0;
      let b: number;
      do {
        if (index >= encoded.length) return points; // 壊れた入力は読めた所まで
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

export function encodePolyline(points: LatLngPoint[]): string {
  let out = "";
  let prevLat = 0;
  let prevLng = 0;
  const encodeValue = (v: number) => {
    let s = v < 0 ? ~(v << 1) : v << 1;
    while (s >= 0x20) {
      out += String.fromCharCode((0x20 | (s & 0x1f)) + 63);
      s >>= 5;
    }
    out += String.fromCharCode(s + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    encodeValue(lat - prevLat);
    encodeValue(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}

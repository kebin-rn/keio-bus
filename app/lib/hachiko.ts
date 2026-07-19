// ハチ公バス (渋谷区コミュニティバス、京王バス中野営業所受託) の表示対応。
//
// ハチ公バスの便は ODPT の静的 GTFS に系統情報が無く、車両位置だけが
// GTFS-RT に流れてくるため、通常の trip_id 照合では「系統不明」になる。
// 専用車両で運行されるため、車番 (odpt:vehicleNumber) の一致で判定し、
// 系統表示を「ハチ公バス 春の小川ルート」に差し替える。
//
// 車番は環境変数 HACHIKO_BUS_VEHICLE_NUMBERS にカンマ区切りの
// 5 桁半角数字で渡す (例: "12345,23456")。形式に合わない要素は無視する。

export const HACHIKO_ROUTE_ID = "hachiko:HaruNoOgawa";
export const HACHIKO_ROUTE_TITLE = "ハチ公バス 春の小川ルート";
// 受託元の営業所名 (office_jp.txt の office_name と照合して officeId を引く)
export const HACHIKO_OFFICE_NAME = "中野営業所";

export function getHachikoVehicleNumbers(): Set<string> {
  const raw = process.env.HACHIKO_BUS_VEHICLE_NUMBERS || "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^[0-9]{5}$/.test(s)),
  );
}

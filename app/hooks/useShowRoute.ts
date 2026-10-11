"use client";

import { useStoredBoolean } from "./useStoredBoolean";

// 地図の経路表示のオン/オフ。ブラウザに保存し、PC 版とスマホ版で共有する
// (保存の仕方は useStoredBoolean。"0" ならオフ、未保存ならオン)
export function useShowRoute(): [boolean, (on: boolean) => void] {
  return useStoredBoolean("keio-bus:show-route", true);
}

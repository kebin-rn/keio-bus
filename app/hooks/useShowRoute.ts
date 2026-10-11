"use client";

import { useCallback, useEffect, useState } from "react";

// 地図の経路表示のオン/オフ。ブラウザに保存し、PC 版とスマホ版で共有する。
//
// ページは静的に事前生成されるため、最初の描画では保存値を読まない (useState の
// 初期化関数で localStorage を読むと、サーバーで作った HTML と食い違う)。まず既定の
// オンで描画し、マウント後に保存値を反映する。保存できない環境 (プライベート
// ブラウズ・サイトデータのブロックなど) では、その画面の中だけの切り替えになる
const STORAGE_KEY = "keio-bus:show-route";

export function useShowRoute(): [boolean, (on: boolean) => void] {
  const [showRoute, setShowRoute] = useState(true);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "0") setShowRoute(false);
    } catch {
      // 読めなければ既定のオンのまま
    }
  }, []);

  // 保存するのは利用者が切り替えたときだけ
  const update = useCallback((on: boolean) => {
    setShowRoute(on);
    try {
      window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
    } catch {
      // 保存できなくても、この画面の中では切り替えられる
    }
  }, []);

  return [showRoute, update];
}

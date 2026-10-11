"use client";

import { useCallback, useEffect, useState } from "react";

// ブラウザに保存するオン/オフの設定 (経路表示・到着予想の一覧の開閉など)。
//
// ページは静的に事前生成されるため、最初の描画では保存値を読まない (useState の
// 初期化関数で localStorage を読むと、サーバーで作った HTML と食い違う)。まず既定値で
// 描画し、マウント後に保存値を反映する。保存するのは利用者が切り替えたときだけ。
// 保存できない環境 (プライベートブラウズ・サイトデータのブロックなど) では、
// その画面の中だけの切り替えになる
export function useStoredBoolean(
  key: string,
  defaultValue: boolean,
): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored === "0") setValue(false);
      else if (stored === "1") setValue(true);
    } catch {
      // 読めなければ既定値のまま
    }
  }, [key]);

  const update = useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // 保存できなくても、この画面の中では切り替えられる
      }
    },
    [key],
  );

  return [value, update];
}

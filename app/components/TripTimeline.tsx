"use client";

import { useEffect, useRef, useState } from "react";
import { busStatusText, type TimelineStop } from "../lib/stopStatus";
import TripStopRow from "./TripStopRow";

// PC 版地図の情報カードに出す、便の停留所ごとの到着予想の一覧。
// 行の中身は接近案内の便詳細シートと同じ (TripStopRow)。経路表示がオンの間は、
// 行を押すと地図でその停留所 (名前と時刻の札) を示し、地図で点を押すと行を強調する。
// 一覧は便ごとに作り直す (呼び出し側で key に便 ID を渡す)
export default function TripTimeline({
  id,
  stops,
  status,
  currentSeq,
  beforeDeparture,
  stopped,
  selectable,
  focusedSeq,
  focusFrom,
  onSelectStop,
}: {
  id: string;
  stops: TimelineStop[] | null;
  status: "loading" | "error" | "ready";
  currentSeq: number;
  beforeDeparture: boolean;
  stopped: boolean;
  selectable: boolean; // 経路表示がオン (地図に停留所の点がある)
  focusedSeq: number | null;
  focusFrom: "map" | "list" | null;
  onSelectStop: (seq: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);
  // キーボードで最後に移動した行 (Tab で一覧に入ったときに戻る行)
  const [rovingSeq, setRovingSeq] = useState<number | null>(null);

  const rows = stops ?? [];
  // 地図に点がある停留所 (座標あり) だけ押せる
  const clickable = selectable
    ? rows.filter((s) => s.lat !== undefined && s.lng !== undefined).map((s) => s.seq)
    : [];
  const tabSeq =
    [rovingSeq, focusedSeq, rows.find((s) => s.state === "current")?.seq, clickable[0]].find(
      (seq) => seq !== null && seq !== undefined && clickable.includes(seq),
    ) ?? null;

  // 初回だけ、選んでいる停留所 (無ければバスの現在位置) の 1 行上までスクロールする。
  // 30 秒ごとの更新では動かさない (読んでいる位置が飛ばないように)
  useEffect(() => {
    if (scrolled.current || !rows.length || !listRef.current) return;
    const list = listRef.current;
    const row =
      (focusedSeq !== null
        ? list.querySelector<HTMLElement>(`[data-row-seq="${focusedSeq}"]`)
        : null) ?? list.querySelector<HTMLElement>('[data-row-seq][data-state="current"]');
    if (row) list.scrollTop = Math.max(0, row.offsetTop - row.offsetHeight);
    scrolled.current = true;
  }, [rows.length, focusedSeq]);

  // 地図で点を押したとき、その行が一覧の見えない所にあれば中央に来るようにする
  useEffect(() => {
    if (focusFrom !== "map" || focusedSeq === null || !listRef.current) return;
    const list = listRef.current;
    const row = list.querySelector<HTMLElement>(`[data-row-seq="${focusedSeq}"]`);
    if (!row) return;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < list.scrollTop || bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = top - (list.clientHeight - row.offsetHeight) / 2;
    }
  }, [focusFrom, focusedSeq]);

  // 押せる行の間を ↑↓ / Home / End で移動し、Enter / Space で選ぶ
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const seqAttr = target.dataset.seq;
    if (seqAttr === undefined || !clickable.length) return;
    const seq = Number(seqAttr);
    const i = clickable.indexOf(seq);
    let next: number | undefined;
    if (e.key === "ArrowDown") next = clickable[Math.min(i + 1, clickable.length - 1)];
    else if (e.key === "ArrowUp") next = clickable[Math.max(i - 1, 0)];
    else if (e.key === "Home") next = clickable[0];
    else if (e.key === "End") next = clickable[clickable.length - 1];
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setRovingSeq(seq);
      onSelectStop(seq);
      return;
    } else {
      return;
    }
    e.preventDefault();
    if (next === undefined) return;
    setRovingSeq(next);
    listRef.current?.querySelector<HTMLElement>(`[data-seq="${next}"]`)?.focus();
  };

  const empty =
    status === "loading"
      ? "読み込み中..."
      : status === "error"
        ? "停留所情報を取得できません (自動で再試行します)"
        : rows.length === 0
          ? "停留所情報がありません"
          : null;

  return (
    <div
      ref={listRef}
      id={id}
      role="region"
      aria-label="停留所一覧"
      // 押せる行が無いときは、キーボードで一覧をスクロールできるよう一覧自体に移動できる
      tabIndex={clickable.length ? undefined : 0}
      onKeyDown={onKeyDown}
      // Tab などで行に移ったら、その行を Tab の戻り先にする (更新でバスが進んだり
      // 選択を外したりしても、フォーカスのある行から Tab の戻り先が離れないように)
      onFocus={(e) => {
        const seq = (e.target as HTMLElement).dataset.seq;
        if (seq !== undefined) setRovingSeq(Number(seq));
      }}
      style={{
        flex: "1 1 auto",
        // 地図が低い (画面を拡大している) ときも 3 行ほどは見えるようにする。
        // 入りきらない分はカード全体をスクロールする
        minHeight: empty ? 0 : Math.min(124, rows.length * 40 + 12),
        overflowY: "auto",
        overscrollBehavior: "contain",
        borderTop: "1px solid #e2e8f0",
        padding: "4px 0 8px",
        position: "relative",
      }}
    >
      {empty ? (
        <div style={{ padding: 24, textAlign: "center", color: "#64748b", fontSize: 12 }}>
          {empty}
        </div>
      ) : (
        rows.map((s, i) => {
          const canSelect = clickable.includes(s.seq);
          return (
            <div key={s.seq} data-row-seq={s.seq} data-state={s.state}>
              <TripStopRow
                stop={s}
                isFirst={i === 0}
                isLast={i === rows.length - 1}
                highlighted={false}
                live
                stopsAhead={s.seq - currentSeq}
                beforeDeparture={beforeDeparture}
                busStatusText={busStatusText(beforeDeparture, stopped)}
                variant="light"
                focused={s.seq === focusedSeq}
                interactive={
                  canSelect
                    ? {
                        onSelect: () => {
                          setRovingSeq(s.seq);
                          onSelectStop(s.seq);
                        },
                        tabIndex: s.seq === tabSeq ? 0 : -1,
                      }
                    : undefined
                }
              />
            </div>
          );
        })
      )}
    </div>
  );
}

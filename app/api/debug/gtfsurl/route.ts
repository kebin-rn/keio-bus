import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = "https://api.odpt.org/api/v4/files/odpt/KeioBus/AllLines.zip";

// 直近 N 日を日単位で生成（新しい順）
function recentDates(days: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(now.getTime() - i * 86400000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    out.push(`${y}${m}${day}`);
  }
  return out;
}

// 本体をダウンロードせず先頭数バイトだけ取得して存在/zip 判定
async function exists(date: string | null) {
  const key = process.env.ODPT_CONSUMER_KEY || "";
  const url = new URL(BASE);
  if (date) url.searchParams.set("date", date);
  url.searchParams.set("acl:consumerKey", key);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url.toString(), {
      cache: "no-store",
      signal: controller.signal,
      redirect: "follow",
      headers: { Range: "bytes=0-3" },
    });
    clearTimeout(timer);
    let isZip = false;
    if (res.ok || res.status === 206) {
      const buf = await res.arrayBuffer();
      const head = new Uint8Array(buf.slice(0, 2));
      isZip = head[0] === 0x50 && head[1] === 0x4b;
    }
    return { date: date ?? "(no date)", status: res.status, isZip };
  } catch (e) {
    return {
      date: date ?? "(no date)",
      status: -1,
      isZip: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function inBatches<T, R>(
  items: T[],
  size: number,
  fn: (t: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    out.push(...(await Promise.all(batch.map(fn))));
  }
  return out;
}

export async function GET() {
  const dates = recentDates(150);
  const results = await inBatches(dates, 20, (d) => exists(d));
  const noDate = await exists(null);
  const working = results.filter((r) => r.isZip).map((r) => r.date);
  return NextResponse.json({
    noDate,
    workingDates: working,
    latestWorking: working[0] ?? null,
    // 200/206 だが zip でないもの（参考）
    okButNotZip: results
      .filter((r) => (r.status === 200 || r.status === 206) && !r.isZip)
      .map((r) => r.date),
    scanned: dates.length,
  });
}

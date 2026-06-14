import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE = "https://api.odpt.org/api/v4/files/odpt/KeioBus/AllLines.zip";

function datesToTry(): string[] {
  const out = new Set<string>();
  // 明示候補
  ["20260401", "20260601", "20260501"].forEach((d) => out.add(d));
  // 今日から過去90日、各月1日と当日を候補に
  const now = new Date();
  for (let i = 0; i < 120; i += 1) {
    const d = new Date(now.getTime() - i * 86400000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    if (day === "01") out.add(`${y}${m}${day}`);
  }
  return [...out];
}

async function probe(url: string) {
  const key = process.env.ODPT_CONSUMER_KEY || "";
  const full = url.includes("?")
    ? `${url}&acl:consumerKey=${encodeURIComponent(key)}`
    : `${url}?acl:consumerKey=${encodeURIComponent(key)}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(full, {
      cache: "no-store",
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    const ct = res.headers.get("content-type") || "";
    let isZip = false;
    let bytes = 0;
    if (res.ok) {
      const buf = await res.arrayBuffer();
      bytes = buf.byteLength;
      const head = new Uint8Array(buf.slice(0, 2));
      isZip = head[0] === 0x50 && head[1] === 0x4b;
    }
    return { status: res.status, contentType: ct, isZip, bytes };
  } catch (e) {
    return { status: -1, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET() {
  // まず date なし
  const noDate = await probe(BASE);

  // 日付つきを順に（最初に zip が取れたら止める）
  const dated: Record<string, unknown> = {};
  let firstWorking: string | null = null;
  for (const d of datesToTry()) {
    const r = await probe(`${BASE}?date=${d}`);
    dated[d] = r;
    if (r.isZip) {
      firstWorking = d;
      break;
    }
  }

  return NextResponse.json({
    noDate,
    firstWorkingDate: firstWorking,
    dated,
  });
}

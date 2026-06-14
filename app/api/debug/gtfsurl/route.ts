import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BASE = "https://api.odpt.org/api/v4/files/odpt/KeioBus/AllLines.zip";

function candidateDates(): string[] {
  const out = new Set<string>(["20260401"]);
  const now = new Date();
  // 直近6ヶ月の月初 + 今日
  for (let i = 0; i < 6; i += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    out.add(`${y}${m}01`);
  }
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  out.add(`${y}${m}${day}`);
  return [...out];
}

async function probe(label: string, url: string) {
  const key = process.env.ODPT_CONSUMER_KEY || "";
  const full = url.includes("?")
    ? `${url}&acl:consumerKey=${encodeURIComponent(key)}`
    : `${url}?acl:consumerKey=${encodeURIComponent(key)}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(full, {
      cache: "no-store",
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    let isZip = false;
    let bytes = 0;
    if (res.ok) {
      const buf = await res.arrayBuffer();
      bytes = buf.byteLength;
      const head = new Uint8Array(buf.slice(0, 2));
      isZip = head[0] === 0x50 && head[1] === 0x4b;
    }
    return { label, status: res.status, isZip, bytes };
  } catch (e) {
    return { label, status: -1, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET() {
  const probes = [
    probe("noDate", BASE),
    ...candidateDates().map((d) => probe(d, `${BASE}?date=${d}`)),
  ];
  const results = await Promise.all(probes);
  const working = results.filter((r) => r.isZip).map((r) => r.label);
  return NextResponse.json({ working, results });
}

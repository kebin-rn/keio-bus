import { NextResponse } from "next/server";
import JSZip from "jszip";

export const dynamic = "force-dynamic";

const STATIC_GTFS_URL = "https://api.odpt.org/api/v4/files/odpt/KeioBus/AllLines.zip";
const GTFS_VERSION_DATE = process.env.KEIO_BUS_GTFS_DATE || "20260401";

export async function GET() {
  const key = process.env.ODPT_CONSUMER_KEY;
  if (!key) return NextResponse.json({ error: "no key" }, { status: 500 });

  const url = new URL(STATIC_GTFS_URL);
  url.searchParams.set("date", GTFS_VERSION_DATE);
  url.searchParams.set("acl:consumerKey", key);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return NextResponse.json({ error: res.status }, { status: 500 });
  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  const files: string[] = [];
  zip.forEach((path) => files.push(path));

  const result: Record<string, unknown> = { files, sizeBytes: buf.byteLength };

  // sample of relevant Japanese extension files
  for (const name of [
    "agency_jp.txt",
    "office_jp.txt",
    "routes_jp.txt",
    "feed_info.txt",
    "routes.txt",
  ]) {
    const file = zip.file(name);
    if (file) {
      const text = await file.async("string");
      result[name] = {
        header: text.split(/\r?\n/)[0],
        firstRows: text.split(/\r?\n/).slice(1, 6),
      };
    }
  }

  return NextResponse.json(result);
}

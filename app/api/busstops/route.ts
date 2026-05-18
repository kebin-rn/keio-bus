import { NextResponse } from "next/server";
import { getKeioOperators, odptFetch } from "@/app/lib/odpt";
import type { OdptBusstopPole } from "@/app/types/odpt";

export const revalidate = 86400;

export async function GET() {
  const operators = getKeioOperators();
  try {
    const results = await Promise.all(
      operators.map((op) =>
        odptFetch<OdptBusstopPole>(
          "odpt:BusstopPole",
          { "odpt:operator": op },
          { revalidate: 86400 },
        ),
      ),
    );
    const stops = results.flat();
    const map: Record<string, { title: string; lat?: number; lng?: number }> = {};
    for (const s of stops) {
      const id = s["owl:sameAs"] || s["@id"];
      map[id] = {
        title: s["dc:title"],
        lat: s["geo:lat"],
        lng: s["geo:long"],
      };
    }
    return NextResponse.json({ stops: map });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

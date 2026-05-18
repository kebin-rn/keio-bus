import { NextResponse } from "next/server";
import { getKeioOperators, odptFetch } from "@/app/lib/odpt";
import type { OdptBusroutePattern } from "@/app/types/odpt";

export const revalidate = 3600;

export async function GET() {
  const operators = getKeioOperators();
  try {
    const results = await Promise.all(
      operators.map((op) =>
        odptFetch<OdptBusroutePattern>(
          "odpt:BusroutePattern",
          { "odpt:operator": op },
          { revalidate: 3600 },
        ),
      ),
    );
    return NextResponse.json({ patterns: results.flat() });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

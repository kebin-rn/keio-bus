import { NextResponse } from "next/server";
import { getKeioOperators, odptFetch } from "@/app/lib/odpt";
import type { OdptBus } from "@/app/types/odpt";

export const dynamic = "force-dynamic";

export async function GET() {
  const operators = getKeioOperators();
  try {
    const results = await Promise.all(
      operators.map((op) => odptFetch<OdptBus>("odpt:Bus", { "odpt:operator": op })),
    );
    const buses = results.flat();
    return NextResponse.json({
      buses,
      fetchedAt: new Date().toISOString(),
      operators,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getKeioOperators, odptFetch } from "@/app/lib/odpt";
import type { OdptBus } from "@/app/types/odpt";

export const dynamic = "force-dynamic";

export async function GET() {
  const operators = getKeioOperators();

  const settled = await Promise.allSettled(
    operators.map((op) => odptFetch<OdptBus>("odpt:Bus", { "odpt:operator": op })),
  );

  const buses: OdptBus[] = [];
  const perOperator: Array<{ operator: string; count: number; error?: string }> = [];

  settled.forEach((r, i) => {
    const op = operators[i];
    if (r.status === "fulfilled") {
      buses.push(...r.value);
      perOperator.push({ operator: op, count: r.value.length });
    } else {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      perOperator.push({ operator: op, count: 0, error: msg });
    }
  });

  const anyError = perOperator.some((p) => p.error);
  return NextResponse.json(
    {
      buses,
      fetchedAt: new Date().toISOString(),
      operators,
      perOperator,
    },
    { status: anyError && buses.length === 0 ? 500 : 200 },
  );
}

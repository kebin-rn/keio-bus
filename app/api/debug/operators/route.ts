import { NextResponse } from "next/server";
import { odptFetch } from "@/app/lib/odpt";

export const dynamic = "force-dynamic";

interface OdptOperator {
  "@id": string;
  "@type": string;
  "owl:sameAs": string;
  "dc:title"?: string;
  "odpt:operatorTitle"?: { ja?: string; en?: string };
}

export async function GET() {
  try {
    const [busOps, allOps] = await Promise.all([
      odptFetch<OdptOperator>("odpt:BusOperator").catch(() => [] as OdptOperator[]),
      odptFetch<OdptOperator>("odpt:Operator").catch(() => [] as OdptOperator[]),
    ]);

    const candidates = [...busOps, ...allOps];
    const seen = new Set<string>();
    const unique = candidates.filter((o) => {
      const id = o["owl:sameAs"];
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    const keio = unique.filter((o) => {
      const title = o["dc:title"] || o["odpt:operatorTitle"]?.ja || "";
      const id = o["owl:sameAs"] || "";
      return /京王|keio/i.test(title) || /Keio/i.test(id);
    });

    return NextResponse.json({
      busOperatorCount: busOps.length,
      operatorCount: allOps.length,
      keioMatches: keio.map((o) => ({
        id: o["owl:sameAs"],
        title: o["dc:title"] || o["odpt:operatorTitle"]?.ja,
        type: o["@type"],
      })),
      sampleBusOperators: busOps.slice(0, 20).map((o) => ({
        id: o["owl:sameAs"],
        title: o["dc:title"],
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

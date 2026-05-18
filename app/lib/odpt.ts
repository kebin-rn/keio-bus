const ODPT_BASE = "https://api.odpt.org/api/v4";

export async function odptFetch<T>(
  resource: string,
  params: Record<string, string> = {},
  init?: { revalidate?: number },
): Promise<T[]> {
  const key = process.env.ODPT_CONSUMER_KEY;
  if (!key) {
    throw new Error("ODPT_CONSUMER_KEY is not set");
  }

  const url = new URL(`${ODPT_BASE}/${resource}`);
  url.searchParams.set("acl:consumerKey", key);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    next: init?.revalidate !== undefined ? { revalidate: init.revalidate } : undefined,
    cache: init?.revalidate === undefined ? "no-store" : undefined,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ODPT ${resource} ${res.status}: ${body.slice(0, 200)}`);
  }

  return res.json() as Promise<T[]>;
}

export function getKeioOperators(): string[] {
  const raw = process.env.NEXT_PUBLIC_KEIO_BUS_OPERATORS || "odpt.Operator:KeioBus";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BRAPI_BASE = "https://brapi.dev/api";

function mapResult(r: Record<string, unknown>, symbol: string) {
  return {
    symbol: (r.symbol as string) ?? symbol,
    shortName: (r.shortName as string) ?? symbol,
    longName: (r.longName as string) ?? null,
    currency: (r.currency as string) ?? "BRL",
    regularMarketPrice: (r.regularMarketPrice as number) ?? 0,
    regularMarketChange: (r.regularMarketChange as number) ?? 0,
    regularMarketChangePercent: (r.regularMarketChangePercent as number) ?? 0,
    regularMarketOpen: (r.regularMarketOpen as number) ?? null,
    regularMarketDayHigh: (r.regularMarketDayHigh as number) ?? null,
    regularMarketDayLow: (r.regularMarketDayLow as number) ?? null,
    regularMarketVolume: (r.regularMarketVolume as number) ?? null,
    regularMarketPreviousClose: (r.regularMarketPreviousClose as number) ?? null,
    fiftyTwoWeekHigh: (r.fiftyTwoWeekHigh as number) ?? null,
    fiftyTwoWeekLow: (r.fiftyTwoWeekLow as number) ?? null,
    marketCap: (r.marketCap as number) ?? null,
    priceEarnings: (r.priceEarnings as number) ?? null,
    earningsPerShare: (r.earningsPerShare as number) ?? null,
    logourl: (r.logourl as string) ?? null,
  };
}

async function brapiQuote(
  symbol: string,
  token: string | null,
  fundamental: boolean
): Promise<{ r: Record<string, unknown> | null; status: number }> {
  const tokenPart = token ? `?token=${token}` : "?";
  const fundPart = fundamental ? "&fundamental=true" : "";
  const url = `${BRAPI_BASE}/quote/${symbol}${tokenPart}${fundPart}`;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { r: null, status: res.status };
    const data = await res.json();
    if (data.error) return { r: null, status: 200 };
    const r = (data.results ?? [])[0] ?? null;
    return { r, status: 200 };
  } catch {
    return { r: null, status: 0 };
  }
}

// Fetches one ticker with multiple fallbacks:
// 1. token + fundamental=true
// 2. token + fundamental=false
// 3. no token + fundamental=false  (public BRAPI endpoint for some tickers)
async function fetchOne(symbol: string, token: string) {
  const sym = symbol.trim().toUpperCase();

  const attempts: [string | null, boolean][] = [
    [token, true],
    [token, false],
    [null, false],
  ];

  for (const [tok, fund] of attempts) {
    const { r, status } = await brapiQuote(sym, tok, fund);
    if (r) return mapResult(r, sym);
    if (status !== 401 && status !== 200) break; // network error — don't retry
  }

  console.error(`[quotes] ${sym}: all attempts failed`);
  return { symbol: sym, error: "HTTP 401 — token inválido" };
}

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = request.nextUrl.searchParams.get("symbols") ?? "";
  if (!raw) return NextResponse.json({ error: "No symbols" }, { status: 400 });

  const symbols = raw
    .split(",")
    .map(s => s.replace(/[^A-Z0-9]/gi, "").toUpperCase())
    .filter(Boolean);

  const token = process.env.BRAPI_TOKEN!;

  // Sequential fetch to avoid BRAPI rate limiting (free plan: 1 req/s)
  const results = [];
  for (const sym of symbols) {
    results.push(await fetchOne(sym, token));
  }

  return NextResponse.json({ results });
}

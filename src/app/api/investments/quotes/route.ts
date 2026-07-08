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

async function brapiQuote(symbol: string, token: string, fundamental: boolean) {
  const url = `${BRAPI_BASE}/quote/${symbol}?token=${token}${fundamental ? "&fundamental=true" : ""}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.error) return null;
  const r = (data.results ?? [])[0];
  return r ?? null;
}

// Fetches one ticker; retries without fundamental=true if first attempt fails
async function fetchOne(symbol: string, token: string) {
  const sym = symbol.trim().toUpperCase();
  try {
    // Try with fundamentals first
    let r = await brapiQuote(sym, token, true);
    // Retry without fundamentals (some tickers fail with fundamental=true)
    if (!r) r = await brapiQuote(sym, token, false);
    if (!r) {
      console.error(`brapi ${sym}: no data`);
      return { symbol: sym, error: "Sem dados" };
    }
    return mapResult(r as Record<string, unknown>, sym);
  } catch (e) {
    console.error(`brapi ${sym}:`, e);
    return { symbol: sym, error: "Timeout" };
  }
}

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

  // Parallel individual requests — 1 ticker each to respect free plan limit
  const results = await Promise.all(symbols.map((s) => fetchOne(s, token)));

  return NextResponse.json({ results });
}

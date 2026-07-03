import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BRAPI_BASE = "https://brapi.dev/api";

// Fetches one ticker at a time (brapi free plan allows only 1 per request)
async function fetchOne(symbol: string, token: string) {
  const url = `${BRAPI_BASE}/quote/${symbol}?token=${token}&fundamental=true`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    console.error(`brapi ${symbol}: HTTP ${res.status}`);
    return { symbol, error: `HTTP ${res.status}` };
  }

  const data = await res.json();

  // brapi v1 error (e.g. invalid ticker)
  if (data.error) {
    console.error(`brapi ${symbol}:`, data.message ?? data.error);
    return { symbol, error: data.message ?? String(data.error) };
  }

  const r = (data.results ?? [])[0];
  if (!r) return { symbol, error: "no data" };

  return {
    symbol: r.symbol ?? symbol,
    shortName: r.shortName ?? symbol,
    longName: r.longName ?? null,
    currency: r.currency ?? "BRL",
    regularMarketPrice: r.regularMarketPrice ?? 0,
    regularMarketChange: r.regularMarketChange ?? 0,
    regularMarketChangePercent: r.regularMarketChangePercent ?? 0,
    regularMarketOpen: r.regularMarketOpen ?? null,
    regularMarketDayHigh: r.regularMarketDayHigh ?? null,
    regularMarketDayLow: r.regularMarketDayLow ?? null,
    regularMarketVolume: r.regularMarketVolume ?? null,
    regularMarketPreviousClose: r.regularMarketPreviousClose ?? null,
    fiftyTwoWeekHigh: r.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: r.fiftyTwoWeekLow ?? null,
    marketCap: r.marketCap ?? null,
    priceEarnings: r.priceEarnings ?? null,
    earningsPerShare: r.earningsPerShare ?? null,
    logourl: r.logourl ?? null,
  };
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = request.nextUrl.searchParams.get("symbols") ?? "";
  if (!raw) return NextResponse.json({ error: "No symbols" }, { status: 400 });

  const symbols = raw
    .replace(/[^A-Z0-9,.\-]/gi, "")
    .split(",")
    .filter(Boolean);

  const token = process.env.BRAPI_TOKEN!;

  // Parallel individual requests — 1 ticker each to respect free plan limit
  const results = await Promise.all(symbols.map((s) => fetchOne(s, token)));

  return NextResponse.json({ results });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getYahooAuth, yahooV7Fetch, YF_UA } from "@/lib/investments/yahoo-auth";

const TICKER_RE = /^[A-Z]{3,6}\d{0,2}$/;

async function yahooSearch(q: string): Promise<string[]> {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=20&newsCount=0&listsCount=0&lang=pt-BR&region=BR`;
  const res = await fetch(url, {
    headers: { "User-Agent": YF_UA },
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.quotes ?? [])
    .filter((r: { symbol?: string }) => r.symbol?.endsWith(".SA"))
    .map((r: { symbol: string }) => r.symbol.replace(/\.SA$/i, "").toUpperCase())
    .slice(0, 20);
}

async function verifyTicker(
  symbol: string,
  auth: { crumb: string; cookies: string } | null,
): Promise<boolean> {
  try {
    const res = await yahooV7Fetch([symbol], "regularMarketPrice", auth, 5000);
    if (!res.ok) return false;
    const data = await res.json();
    return !!(data?.quoteResponse?.result?.[0]?.regularMarketPrice);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ stocks: [] }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q") ?? "";

  // Yahoo Finance search (v1/finance/search — no crumb needed)
  try {
    const tickers = await yahooSearch(q);
    if (tickers.length > 0) return NextResponse.json({ stocks: tickers });
  } catch { /* fall through */ }

  // Fallback: if query looks like an exact ticker, verify directly via v7
  const upper = q.trim().toUpperCase();
  if (upper && TICKER_RE.test(upper)) {
    const auth = await getYahooAuth();
    if (await verifyTicker(upper, auth)) {
      return NextResponse.json({ stocks: [upper] });
    }
  }

  return NextResponse.json({ stocks: [] });
}

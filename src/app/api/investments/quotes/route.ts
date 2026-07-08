import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const YF_HEADERS = { "User-Agent": "Mozilla/5.0" };

export const maxDuration = 60;

async function fetchSingleQuote(symbol: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(
      `${YAHOO_CHART}/${symbol}.SA?range=1y&interval=1d`,
      { headers: YF_HEADERS, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return { symbol, error: `HTTP ${res.status}` };

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result?.meta?.regularMarketPrice) return { symbol, error: "Sem dados" };

    const meta = result.meta as Record<string, unknown>;
    const quote = (result.indicators?.quote?.[0] ?? {}) as Record<string, (number | null)[]>;

    // Filter nulls for aggregation
    const highs = (quote.high ?? []).filter((v): v is number => v != null);
    const lows  = (quote.low  ?? []).filter((v): v is number => v != null);
    const opens = (quote.open ?? []).filter((v): v is number => v != null);
    const vols  = (quote.volume ?? []).filter((v): v is number => v != null);

    const regularMarketPrice    = (meta.regularMarketPrice  as number) ?? 0;
    const chartPreviousClose    = (meta.chartPreviousClose  as number) ?? (meta.previousClose as number) ?? 0;
    const regularMarketChange   = (meta.regularMarketChange as number) ??
      (chartPreviousClose > 0 ? regularMarketPrice - chartPreviousClose : 0);
    const regularMarketChangePercent = (meta.regularMarketChangePercent as number) ??
      (chartPreviousClose > 0 ? (regularMarketChange / chartPreviousClose) * 100 : 0);

    return {
      symbol,
      shortName: (meta.longName ?? meta.shortName ?? symbol) as string,
      longName:  (meta.longName ?? null) as string | null,
      currency:  (meta.currency ?? "BRL") as string,
      regularMarketPrice,
      regularMarketChange,
      regularMarketChangePercent,
      // Last candle = today's session data
      regularMarketOpen:          opens.at(-1) ?? null,
      regularMarketDayHigh:       highs.at(-1) ?? null,
      regularMarketDayLow:        lows.at(-1)  ?? null,
      regularMarketVolume:        vols.at(-1)  ?? null,
      regularMarketPreviousClose: chartPreviousClose || null,
      // 52-week range from the 1-year OHLCV history
      fiftyTwoWeekHigh: highs.length > 0 ? Math.max(...highs) : null,
      fiftyTwoWeekLow:  lows.length  > 0 ? Math.min(...lows)  : null,
      // Not available via chart endpoint
      marketCap:        null,
      priceEarnings:    null,
      earningsPerShare: null,
      logourl:          null,
    };
  } catch {
    return { symbol, error: "Erro de rede" };
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

  if (symbols.length === 0) return NextResponse.json({ results: [] });

  const results = await Promise.all(symbols.map(fetchSingleQuote));
  return NextResponse.json({ results });
}

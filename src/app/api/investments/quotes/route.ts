import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BRAPI_BASE = "https://brapi.dev/api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapV2(s: any) {
  const sd = s.summaryDetail ?? {};
  const ks = s.defaultKeyStatistics ?? {};
  const prevClose = sd.previousClose ?? (s.close / (1 + (s.change ?? 0) / 100));
  return {
    symbol: s.stock ?? s.symbol,
    shortName: s.name ?? s.shortName ?? s.stock,
    longName: s.longName ?? s.name,
    currency: "BRL",
    regularMarketPrice: s.close ?? s.regularMarketPrice ?? 0,
    regularMarketChangePercent: s.change ?? s.regularMarketChangePercent ?? 0,
    regularMarketChange: sd.regularMarketChange ?? (s.close - prevClose),
    regularMarketOpen: sd.open ?? sd.regularMarketOpen ?? s.close,
    regularMarketDayHigh: sd.dayHigh ?? sd.regularMarketDayHigh ?? s.close,
    regularMarketDayLow: sd.dayLow ?? sd.regularMarketDayLow ?? s.close,
    regularMarketVolume: s.volume ?? sd.volume ?? 0,
    regularMarketPreviousClose: prevClose,
    fiftyTwoWeekHigh: sd.fiftyTwoWeekHigh ?? s.close,
    fiftyTwoWeekLow: sd.fiftyTwoWeekLow ?? s.close,
    marketCap: s.market_cap ?? sd.marketCap ?? null,
    priceEarnings: sd.trailingPE ?? ks.trailingPE ?? null,
    earningsPerShare: ks.trailingEps ?? null,
    logourl: s.logo ?? s.logourl ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapV1(r: any) {
  return {
    symbol: r.symbol,
    shortName: r.shortName ?? r.symbol,
    longName: r.longName ?? null,
    currency: r.currency ?? "BRL",
    regularMarketPrice: r.regularMarketPrice ?? 0,
    regularMarketChangePercent: r.regularMarketChangePercent ?? 0,
    regularMarketChange: r.regularMarketChange ?? 0,
    regularMarketOpen: r.regularMarketOpen ?? r.regularMarketPrice,
    regularMarketDayHigh: r.regularMarketDayHigh ?? r.regularMarketPrice,
    regularMarketDayLow: r.regularMarketDayLow ?? r.regularMarketPrice,
    regularMarketVolume: r.regularMarketVolume ?? 0,
    regularMarketPreviousClose: r.regularMarketPreviousClose ?? r.regularMarketPrice,
    fiftyTwoWeekHigh: r.fiftyTwoWeekHigh ?? r.regularMarketPrice,
    fiftyTwoWeekLow: r.fiftyTwoWeekLow ?? r.regularMarketPrice,
    marketCap: r.marketCap ?? null,
    priceEarnings: r.priceEarnings ?? null,
    earningsPerShare: r.earningsPerShare ?? null,
    logourl: r.logourl ?? null,
  };
}

// Fetches a single ticker — brapi free plan allows only 1 per request
async function fetchOne(symbol: string, token: string) {
  // Try v2
  try {
    const url = `${BRAPI_BASE}/v2/stocks/quote?symbols=${symbol}&token=${token}&modules=summaryDetail,defaultKeyStatistics`;
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const stocks = data.stocks ?? data.results ?? [];
      if (stocks.length > 0) return mapV2(stocks[0]);
    }
  } catch { /* fall through */ }

  // Fallback to v1
  try {
    const url = `${BRAPI_BASE}/quote/${symbol}?token=${token}&fundamental=true`;
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const results = data.results ?? [];
      if (results.length > 0) return mapV1(results[0]);
    }
  } catch { /* ignore */ }

  return { symbol, error: "not found" };
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

  // Free plan: 1 ticker per request — fetch all in parallel
  const results = await Promise.all(symbols.map((s) => fetchOne(s, token)));

  return NextResponse.json({ results });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const YAHOO_QUOTE = "https://query1.finance.yahoo.com/v7/finance/quote";

export const maxDuration = 60;

interface YahooResult {
  symbol: string;
  shortName?: string;
  longName?: string;
  currency?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  regularMarketPreviousClose?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  marketCap?: number;
  trailingPE?: number;
  epsTrailingTwelveMonths?: number;
}

function mapQuote(r: YahooResult, sym: string) {
  return {
    symbol: sym,
    shortName: r.shortName ?? r.longName ?? sym,
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
    priceEarnings: r.trailingPE ?? null,
    earningsPerShare: r.epsTrailingTwelveMonths ?? null,
    logourl: null,
  };
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

  // Yahoo Finance accepts all symbols in one request — much more efficient
  const yahooSymbols = symbols.map(s => `${s}.SA`).join(",");

  try {
    const res = await fetch(
      `${YAHOO_QUOTE}?symbols=${yahooSymbols}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,regularMarketVolume,regularMarketPreviousClose,fiftyTwoWeekHigh,fiftyTwoWeekLow,marketCap,trailingPE,epsTrailingTwelveMonths,shortName,longName,currency`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: `Yahoo Finance: HTTP ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const yahooResults: YahooResult[] = data?.quoteResponse?.result ?? [];

    // Index by B3 symbol (remove .SA suffix)
    const bySymbol = new Map(
      yahooResults.map(r => [r.symbol.replace(/\.SA$/i, "").toUpperCase(), r])
    );

    const results = symbols.map(sym => {
      const r = bySymbol.get(sym);
      if (!r?.regularMarketPrice) return { symbol: sym, error: "Sem dados" };
      return mapQuote(r, sym);
    });

    return NextResponse.json({ results });
  } catch (e) {
    console.error("[quotes] Yahoo Finance error:", e);
    return NextResponse.json({ error: "Erro de rede" }, { status: 502 });
  }
}

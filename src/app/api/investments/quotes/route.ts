import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BRAPI_BASE = "https://brapi.dev/api";

// Maps brapi v2 stock object to the QuoteResult shape the client expects
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

// Maps brapi v1 result (already in the right shape, just normalise missing fields)
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

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = request.nextUrl.searchParams.get("symbols") ?? "";
  if (!raw) return NextResponse.json({ error: "No symbols" }, { status: 400 });

  // Sanitize: keep only alphanumeric, commas, dots, dashes
  const symbols = raw.replace(/[^A-Z0-9,.\-]/gi, "");
  const token = process.env.BRAPI_TOKEN;

  // Try v2 first (current brapi endpoint)
  try {
    const v2url = `${BRAPI_BASE}/v2/stocks/quote?symbols=${symbols}&token=${token}&modules=summaryDetail,defaultKeyStatistics`;
    const v2res = await fetch(v2url, { cache: "no-store" });

    if (v2res.ok) {
      const data = await v2res.json();
      const stocks = data.stocks ?? data.results ?? [];
      if (stocks.length > 0) {
        return NextResponse.json({ results: stocks.map(mapV2) });
      }
    }
  } catch {
    // fall through to v1
  }

  // Fallback to v1
  try {
    const v1url = `${BRAPI_BASE}/quote/${symbols}?token=${token}&fundamental=true`;
    const v1res = await fetch(v1url, { cache: "no-store" });

    if (v1res.ok) {
      const data = await v1res.json();
      const results = data.results ?? [];
      return NextResponse.json({ results: results.map(mapV1) });
    }

    const body = await v1res.text().catch(() => "");
    return NextResponse.json(
      { error: `brapi error ${v1res.status}`, detail: body.slice(0, 300) },
      { status: 502 }
    );
  } catch (err) {
    return NextResponse.json({ error: "Network error", detail: String(err) }, { status: 503 });
  }
}

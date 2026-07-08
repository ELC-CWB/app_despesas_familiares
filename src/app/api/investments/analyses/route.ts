import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SECTOR_MAP } from "@/lib/investments/sectors";
import { fetchFundamentusIndicators, fetchFundamentusProventos } from "@/lib/investments/fundamentus";
import { getYahooAuth, yahooV7Fetch } from "@/lib/investments/yahoo-auth";

interface StockDef {
  symbol: string;
  sector: string;
}

const B3_DIVIDEND_STOCKS: StockDef[] = Object.entries(SECTOR_MAP).map(([symbol, sector]) => ({ symbol, sector }));

interface CashDividend {
  paymentDate: string; // ex-date used as paymentDate for year-grouping in client
  rate: number;
}

interface TickerResult {
  symbol: string;
  sector: string;
  shortName: string;
  logourl: string | null;
  price: number;
  dpa12m: number;
  cashDividends: CashDividend[];
  netDebt: number | null;
  ebitda: number | null;
  payoutRatio: number | null;
}

async function fetchYahooNames(symbols: string[]): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();
  if (!symbols.length) return nameMap;
  try {
    const auth = await getYahooAuth();
    const res = await yahooV7Fetch(symbols, "shortName,longName", auth, 15000);
    if (!res.ok) return nameMap;
    const data = await res.json();
    const results: { symbol: string; shortName?: string; longName?: string }[] = data?.quoteResponse?.result ?? [];
    for (const r of results) {
      const sym = r.symbol.replace(/\.SA$/i, "").toUpperCase();
      nameMap.set(sym, r.longName ?? r.shortName ?? sym);
    }
  } catch { /* fallback to symbol codes */ }
  return nameMap;
}

async function fetchTicker(
  item: StockDef,
  nameMap: Map<string, string>,
): Promise<TickerResult | { symbol: string; error: string }> {
  const { symbol, sector } = item;

  const [fundRes, proventosRes] = await Promise.allSettled([
    fetchFundamentusIndicators(symbol),
    fetchFundamentusProventos(symbol, 7),
  ]);

  const fund = fundRes.status === "fulfilled" ? fundRes.value : null;
  const proventos = proventosRes.status === "fulfilled" ? proventosRes.value : [];

  // Map proventos to CashDividend — use ex-date as the paymentDate for year-grouping
  const cashDividends: CashDividend[] = proventos.map(p => ({
    paymentDate: `${p.exDate}T00:00:00.000Z`,
    rate: p.rate,
  }));

  const price = fund?.price ?? 0;
  if (price === 0 && cashDividends.length === 0) return { symbol, error: "No data" };

  const shortName = nameMap.get(symbol) ?? symbol;
  const netDebt = fund?.netDebt ?? null;
  const ebitda = fund?.ebitda ?? null;
  const lpa = fund?.lpa ?? null;

  // DPA last 12 months (filtered by ex-date)
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);
  const dpa12m = cashDividends
    .filter(d => { const dt = new Date(d.paymentDate); return dt <= now && dt >= oneYearAgo; })
    .reduce((sum, d) => sum + d.rate, 0);

  const payoutRatio = lpa != null && lpa > 0 && dpa12m > 0 ? dpa12m / lpa : null;
  return { symbol, sector, shortName, logourl: null, price, dpa12m, cashDividends, netDebt, ebitda, payoutRatio };
}

export const maxDuration = 60;

async function fetchInBatches(stocks: StockDef[], nameMap: Map<string, string>, batchSize = 20) {
  const out: (TickerResult | { symbol: string; error: string })[] = [];
  for (let i = 0; i < stocks.length; i += batchSize) {
    const batch = stocks.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(s => fetchTicker(s, nameMap)));
    out.push(...results);
  }
  return out;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const symbols = B3_DIVIDEND_STOCKS.map(s => s.symbol);
  const nameMap = await fetchYahooNames(symbols);
  const results = await fetchInBatches(B3_DIVIDEND_STOCKS, nameMap, 20);

  const valid = results.filter((r): r is TickerResult => !("error" in r));
  return NextResponse.json({ results: valid });
}

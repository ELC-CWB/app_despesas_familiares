import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SECTOR_MAP } from "@/lib/investments/sectors";
import { fetchFundamentusIndicators, fetchFundamentusProventos } from "@/lib/investments/fundamentus";

const BRAPI_BASE = "https://brapi.dev/api";

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

async function fetchBrapiMeta(symbol: string, token: string): Promise<{ shortName: string; logourl: string | null } | null> {
  try {
    const res = await fetch(
      `${BRAPI_BASE}/quote/${symbol}?token=${token}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    const r = data.results?.[0];
    if (!r) return null;
    return { shortName: r.longName ?? r.shortName ?? symbol, logourl: r.logourl ?? null };
  } catch {
    return null;
  }
}

async function fetchTicker(
  item: StockDef,
  token: string,
): Promise<TickerResult | { symbol: string; error: string }> {
  const { symbol, sector } = item;

  const [fundRes, proventosRes, brapiRes] = await Promise.allSettled([
    fetchFundamentusIndicators(symbol),
    fetchFundamentusProventos(symbol, 7),
    fetchBrapiMeta(symbol, token),
  ]);

  const fund = fundRes.status === "fulfilled" ? fundRes.value : null;
  const proventos = proventosRes.status === "fulfilled" ? proventosRes.value : [];
  const brapi = brapiRes.status === "fulfilled" ? brapiRes.value : null;

  // Map proventos to CashDividend — use ex-date as the paymentDate for year-grouping
  const cashDividends: CashDividend[] = proventos.map(p => ({
    paymentDate: `${p.exDate}T00:00:00.000Z`,
    rate: p.rate,
  }));

  const price = fund?.price ?? 0;
  if (price === 0 && cashDividends.length === 0) return { symbol, error: "No data" };

  const shortName = brapi?.shortName ?? symbol;
  const logourl = brapi?.logourl ?? null;
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
  return { symbol, sector, shortName, logourl, price, dpa12m, cashDividends, netDebt, ebitda, payoutRatio };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = process.env.BRAPI_TOKEN!;
  const results = await Promise.all(B3_DIVIDEND_STOCKS.map(s => fetchTicker(s, token)));

  const valid = results.filter((r): r is TickerResult => !("error" in r));
  return NextResponse.json({ results: valid });
}

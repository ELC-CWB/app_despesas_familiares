import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BRAPI_BASE = "https://brapi.dev/api";

// Curated list of B3 dividend-paying stocks
const B3_DIVIDEND_STOCKS = [
  // Banks & Financial
  "ITUB4", "ITUB3", "BBDC4", "BBDC3", "SANB11", "SANB4", "SANB3",
  "BBAS3", "BPAC11", "BPAC3", "BRSR6", "BRSR3", "ABCB4", "BMGB4",
  "ITSA4", "ITSA3", "BPAN4",
  // Electric Energy
  "EGIE3", "CPFE3", "TRPL4", "TRPL3", "ENGI11", "ENGI3",
  "TAEE11", "TAEE4", "TAEE3", "CMIG4", "CMIG3", "CPLE6", "CPLE3",
  "ENBR3", "AURE3", "EQTL3", "NEOE3", "CESP6",
  "ALUP11", "ALUP4", "ALUP3",
  // Water & Sanitation
  "SAPR4", "SAPR3", "SAPR11", "CSMG3", "SBSP3",
  // Oil & Gas
  "PETR4", "PETR3", "PRIO3", "RRRP3", "RECV3", "VBBR3", "CGAS5",
  // Mining & Steel
  "VALE3", "CMIN3", "CSNA3", "GGBR4", "GGBR3", "GOAU4", "GOAU3",
  "FESA4", "FESA3", "BRAP4", "BRAP3", "USIM5", "KLBN11", "KLBN4", "SUZB3",
  // Telecom
  "VIVT3", "TIMS3",
  // Insurance
  "BBSE3", "CXSE3", "PSSA3",
  // Consumer & Food
  "AMBEV3", "MDIA3", "GRND3", "VULC3", "RANI3", "AGRO3", "SLCE3",
  // Healthcare
  "FLRY3", "HAPV3", "DASA3", "RDOR3",
  // Logistics & Transport
  "RAIL3", "POMO4", "POMO3", "TPIS3",
  // Manufacturing & Industry
  "WEGE3", "TUPY3", "UNIP6", "FRAS3",
  // Retail & Others
  "ALPA4", "TOTS3", "EVEN3", "CYRE3",
  // Agribusiness
  "BEEF3", "SMLS3",
];

interface CashDividend {
  paymentDate: string;
  rate: number;
  label?: string;
  lastDatePrior?: string;
}

interface TickerResult {
  symbol: string;
  shortName: string;
  logourl: string | null;
  price: number;
  dpa12m: number;
  cashDividends: CashDividend[];
}

async function fetchTicker(symbol: string, token: string): Promise<TickerResult | { symbol: string; error: string }> {
  try {
    // Try with dividend history first
    const res1 = await fetch(`${BRAPI_BASE}/quote/${symbol}?token=${token}&dividends=true`);
    const data1 = await res1.json();

    // brapi free plan blocks dividends=true for most tickers → fallback to price-only
    if (data1.error && data1.code === "FEATURE_NOT_AVAILABLE") {
      const res2 = await fetch(`${BRAPI_BASE}/quote/${symbol}?token=${token}`);
      if (!res2.ok) return { symbol, error: `HTTP ${res2.status}` };
      const data2 = await res2.json();
      if (data2.error) return { symbol, error: data2.message ?? "brapi error" };
      const r2 = (data2.results ?? [])[0];
      if (!r2) return { symbol, error: "no data" };
      return {
        symbol,
        shortName: r2.shortName ?? symbol,
        logourl: r2.logourl ?? null,
        price: r2.regularMarketPrice ?? 0,
        dpa12m: 0,
        cashDividends: [],
      };
    }

    if (data1.error || !res1.ok) return { symbol, error: data1.message ?? `HTTP ${res1.status}` };
    const r = (data1.results ?? [])[0];
    if (!r) return { symbol, error: "no data" };

    const price: number = r.regularMarketPrice ?? 0;
    const cashDividends: CashDividend[] = r.dividendsData?.cashDividends ?? [];

    // DPA last 12 months (paid dividends only, not future)
    const now = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(now.getFullYear() - 1);
    const dpa12m = cashDividends
      .filter(d => { const dt = new Date(d.paymentDate); return dt <= now && dt >= oneYearAgo; })
      .reduce((sum, d) => sum + d.rate, 0);

    return {
      symbol,
      shortName: r.shortName ?? symbol,
      logourl: r.logourl ?? null,
      price,
      dpa12m,
      cashDividends,
    };
  } catch {
    return { symbol, error: "network error" };
  }
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = process.env.BRAPI_TOKEN!;
  const results = await Promise.all(B3_DIVIDEND_STOCKS.map(s => fetchTicker(s, token)));

  // Return all tickers that have valid price data (filter only hard failures)
  const valid = results.filter((r): r is TickerResult => !("error" in r));

  return NextResponse.json({ results: valid });
}

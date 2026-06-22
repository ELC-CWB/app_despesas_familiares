import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BRAPI_BASE = "https://brapi.dev/api";

// Comprehensive list of B3 stocks with dividend history
const B3_DIVIDEND_STOCKS = [
  // Banks & Financial
  "ITUB4", "ITUB3", "BBDC4", "BBDC3", "SANB11", "SANB4", "SANB3",
  "BBAS3", "BPAC11", "BPAC3", "BRSR6", "BRSR3", "ABCB4", "BMGB4",
  "ITSA4", "ITSA3", "BPAR3", "BRGE11", "BICB4",
  // Electric Energy
  "EGIE3", "CPFE3", "TRPL4", "TRPL3", "ENGI11", "ENGI3",
  "TAEE11", "TAEE4", "TAEE3", "CMIG4", "CMIG3", "CPLE6", "CPLE3",
  "ENBR3", "AURE3", "EQTL3", "NEOE3", "CESP6", "CESP3",
  "ALUP11", "ALUP4", "ALUP3", "OMGE3",
  // Water & Sanitation
  "SAPR4", "SAPR3", "SAPR11", "CSMG3", "SBSP3",
  // Oil & Gas
  "PETR4", "PETR3", "PRIO3", "RRRP3", "RECV3", "VBBR3", "CGAS3", "CGAS5",
  // Mining & Steel
  "VALE3", "CMIN3", "CSNA3", "GGBR4", "GGBR3", "GOAU4", "GOAU3",
  "FESA4", "FESA3", "BRAP4", "BRAP3", "USIM5", "USIM3",
  "KLBN11", "KLBN4", "KLBN3", "SUZB3",
  // Telecom
  "VIVT3", "TIMS3",
  // Insurance
  "BBSE3", "CXSE3", "PSSA3", "WIZS3",
  // Consumer & Food
  "AMBEV3", "MDIA3", "GRND3", "VULC3", "RANI3", "SMLS3", "AGRO3", "SLCE3",
  // Healthcare
  "FLRY3", "HAPV3", "DASA3", "RDOR3",
  // Logistics & Transport
  "RAIL3", "POMO4", "POMO3", "TPIS3",
  // Manufacturing & Industry
  "WEGE3", "TUPY3", "UNIP6", "UNIP3", "FRAS3", "MAPT3", "MAPT4",
  // Pulp & Paper
  "RANI3",
  // Retail & Others
  "ALPA4", "ALPA3", "TOTS3", "EVEN3", "CYRE3",
  // Agriculture
  "TTEN3", "BEEF3",
];

interface CashDividend {
  paymentDate: string;
  rate: number;
  label: string;
  lastDatePrior: string;
}

async function fetchTicker(symbol: string, token: string) {
  try {
    const res = await fetch(
      `${BRAPI_BASE}/quote/${symbol}?token=${token}&dividends=true`,
      { next: { revalidate: 3600 } } // cache 1 hour
    );
    if (!res.ok) return { symbol, error: `HTTP ${res.status}` };
    const data = await res.json();
    if (data.error) return { symbol, error: data.message ?? "brapi error" };
    const r = (data.results ?? [])[0];
    if (!r) return { symbol, error: "no data" };

    const price: number = r.regularMarketPrice ?? 0;
    const shortName: string = r.shortName ?? symbol;
    const logourl: string | null = r.logourl ?? null;
    const cashDividends: CashDividend[] = r.dividendsData?.cashDividends ?? [];

    // Must have paid dividends in last 5 years
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    const hasDividends = cashDividends.some(d => new Date(d.paymentDate) >= fiveYearsAgo);
    if (!hasDividends) return { symbol, error: "no dividends in 5y" };

    // DPA last 12 months (paid only)
    const now = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(now.getFullYear() - 1);
    const dpa12m = cashDividends
      .filter(d => {
        const dt = new Date(d.paymentDate);
        return dt <= now && dt >= oneYearAgo;
      })
      .reduce((sum, d) => sum + d.rate, 0);

    return { symbol, shortName, logourl, price, dpa12m, cashDividends };
  } catch {
    return { symbol, error: "network error" };
  }
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = process.env.BRAPI_TOKEN!;
  const results = await Promise.all(
    B3_DIVIDEND_STOCKS.map(s => fetchTicker(s, token))
  );

  // Return only those with actual dividend data
  const valid = results.filter(r => !("error" in r) || r.error === undefined);

  return NextResponse.json({ results: valid });
}

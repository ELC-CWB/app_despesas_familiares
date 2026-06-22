import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BRAPI_BASE = "https://brapi.dev/api";
const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

interface StockDef {
  symbol: string;
  sector: string;
}

const B3_DIVIDEND_STOCKS: StockDef[] = [
  // Bancos
  { symbol: "ITUB4", sector: "Bancos" },
  { symbol: "ITUB3", sector: "Bancos" },
  { symbol: "BBDC4", sector: "Bancos" },
  { symbol: "BBDC3", sector: "Bancos" },
  { symbol: "SANB11", sector: "Bancos" },
  { symbol: "SANB4", sector: "Bancos" },
  { symbol: "SANB3", sector: "Bancos" },
  { symbol: "BBAS3", sector: "Bancos" },
  { symbol: "BPAC11", sector: "Bancos" },
  { symbol: "BPAC3", sector: "Bancos" },
  { symbol: "BRSR6", sector: "Bancos" },
  { symbol: "BRSR3", sector: "Bancos" },
  { symbol: "ABCB4", sector: "Bancos" },
  { symbol: "BMGB4", sector: "Bancos" },
  { symbol: "ITSA4", sector: "Bancos" },
  { symbol: "ITSA3", sector: "Bancos" },
  { symbol: "BPAN4", sector: "Bancos" },
  // Energia Elétrica
  { symbol: "EGIE3", sector: "Energia Elétrica" },
  { symbol: "CPFE3", sector: "Energia Elétrica" },
  { symbol: "TRPL4", sector: "Energia Elétrica" },
  { symbol: "TRPL3", sector: "Energia Elétrica" },
  { symbol: "ENGI11", sector: "Energia Elétrica" },
  { symbol: "ENGI3", sector: "Energia Elétrica" },
  { symbol: "TAEE11", sector: "Energia Elétrica" },
  { symbol: "TAEE4", sector: "Energia Elétrica" },
  { symbol: "TAEE3", sector: "Energia Elétrica" },
  { symbol: "CMIG4", sector: "Energia Elétrica" },
  { symbol: "CMIG3", sector: "Energia Elétrica" },
  { symbol: "CPLE6", sector: "Energia Elétrica" },
  { symbol: "CPLE3", sector: "Energia Elétrica" },
  { symbol: "ENBR3", sector: "Energia Elétrica" },
  { symbol: "AURE3", sector: "Energia Elétrica" },
  { symbol: "EQTL3", sector: "Energia Elétrica" },
  { symbol: "NEOE3", sector: "Energia Elétrica" },
  { symbol: "CESP6", sector: "Energia Elétrica" },
  { symbol: "ALUP11", sector: "Energia Elétrica" },
  { symbol: "ALUP4", sector: "Energia Elétrica" },
  { symbol: "ALUP3", sector: "Energia Elétrica" },
  // Saneamento
  { symbol: "SAPR4", sector: "Saneamento" },
  { symbol: "SAPR3", sector: "Saneamento" },
  { symbol: "SAPR11", sector: "Saneamento" },
  { symbol: "CSMG3", sector: "Saneamento" },
  { symbol: "SBSP3", sector: "Saneamento" },
  // Petróleo & Gás
  { symbol: "PETR4", sector: "Petróleo & Gás" },
  { symbol: "PETR3", sector: "Petróleo & Gás" },
  { symbol: "PRIO3", sector: "Petróleo & Gás" },
  { symbol: "RRRP3", sector: "Petróleo & Gás" },
  { symbol: "RECV3", sector: "Petróleo & Gás" },
  { symbol: "VBBR3", sector: "Petróleo & Gás" },
  { symbol: "CGAS5", sector: "Petróleo & Gás" },
  // Mineração & Siderurgia
  { symbol: "VALE3", sector: "Mineração & Siderurgia" },
  { symbol: "CMIN3", sector: "Mineração & Siderurgia" },
  { symbol: "CSNA3", sector: "Mineração & Siderurgia" },
  { symbol: "GGBR4", sector: "Mineração & Siderurgia" },
  { symbol: "GGBR3", sector: "Mineração & Siderurgia" },
  { symbol: "GOAU4", sector: "Mineração & Siderurgia" },
  { symbol: "GOAU3", sector: "Mineração & Siderurgia" },
  { symbol: "FESA4", sector: "Mineração & Siderurgia" },
  { symbol: "FESA3", sector: "Mineração & Siderurgia" },
  { symbol: "BRAP4", sector: "Mineração & Siderurgia" },
  { symbol: "BRAP3", sector: "Mineração & Siderurgia" },
  { symbol: "USIM5", sector: "Mineração & Siderurgia" },
  { symbol: "KLBN11", sector: "Mineração & Siderurgia" },
  { symbol: "KLBN4", sector: "Mineração & Siderurgia" },
  { symbol: "SUZB3", sector: "Mineração & Siderurgia" },
  // Telecom
  { symbol: "VIVT3", sector: "Telecom" },
  { symbol: "TIMS3", sector: "Telecom" },
  // Seguros
  { symbol: "BBSE3", sector: "Seguros" },
  { symbol: "CXSE3", sector: "Seguros" },
  { symbol: "PSSA3", sector: "Seguros" },
  // Consumo & Alimentos
  { symbol: "AMBEV3", sector: "Consumo" },
  { symbol: "MDIA3", sector: "Consumo" },
  { symbol: "GRND3", sector: "Consumo" },
  { symbol: "VULC3", sector: "Consumo" },
  { symbol: "RANI3", sector: "Consumo" },
  // Saúde
  { symbol: "FLRY3", sector: "Saúde" },
  { symbol: "HAPV3", sector: "Saúde" },
  { symbol: "DASA3", sector: "Saúde" },
  { symbol: "RDOR3", sector: "Saúde" },
  // Logística & Transporte
  { symbol: "RAIL3", sector: "Logística" },
  { symbol: "POMO4", sector: "Logística" },
  { symbol: "POMO3", sector: "Logística" },
  { symbol: "TPIS3", sector: "Logística" },
  // Indústria
  { symbol: "WEGE3", sector: "Indústria" },
  { symbol: "TUPY3", sector: "Indústria" },
  { symbol: "UNIP6", sector: "Indústria" },
  { symbol: "FRAS3", sector: "Indústria" },
  // Varejo & Outros
  { symbol: "ALPA4", sector: "Varejo" },
  { symbol: "TOTS3", sector: "Varejo" },
  { symbol: "EVEN3", sector: "Varejo" },
  { symbol: "CYRE3", sector: "Varejo" },
  // Agronegócio
  { symbol: "BEEF3", sector: "Agronegócio" },
  { symbol: "SLCE3", sector: "Agronegócio" },
  { symbol: "AGRO3", sector: "Agronegócio" },
];

interface CashDividend {
  paymentDate: string;
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
}

async function fetchYahooData(symbol: string): Promise<{ price: number; cashDividends: CashDividend[] } | null> {
  try {
    const res = await fetch(
      `${YAHOO_BASE}/${symbol}.SA?events=div&range=5y&interval=1mo`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const r = data.chart?.result?.[0];
    if (!r) return null;

    const price: number = r.meta?.regularMarketPrice ?? 0;
    const rawDivs: Record<string, { date: number; amount: number }> = r.events?.dividends ?? {};
    const cashDividends: CashDividend[] = Object.values(rawDivs).map(d => ({
      paymentDate: new Date(d.date * 1000).toISOString(),
      rate: d.amount,
    }));

    return { price, cashDividends };
  } catch {
    return null;
  }
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
    return { shortName: r.shortName ?? symbol, logourl: r.logourl ?? null };
  } catch {
    return null;
  }
}

async function fetchTicker(item: StockDef, token: string): Promise<TickerResult | { symbol: string; error: string }> {
  const { symbol, sector } = item;

  const [yahooRes, brapiRes] = await Promise.allSettled([
    fetchYahooData(symbol),
    fetchBrapiMeta(symbol, token),
  ]);

  const yahoo = yahooRes.status === "fulfilled" ? yahooRes.value : null;
  const brapi = brapiRes.status === "fulfilled" ? brapiRes.value : null;

  if (!yahoo) return { symbol, error: "Yahoo fetch failed" };

  const { price, cashDividends } = yahoo;
  const shortName = brapi?.shortName ?? symbol;
  const logourl = brapi?.logourl ?? null;

  // DPA last 12 months (paid only, not future)
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);
  const dpa12m = cashDividends
    .filter(d => { const dt = new Date(d.paymentDate); return dt <= now && dt >= oneYearAgo; })
    .reduce((sum, d) => sum + d.rate, 0);

  return { symbol, sector, shortName, logourl, price, dpa12m, cashDividends };
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

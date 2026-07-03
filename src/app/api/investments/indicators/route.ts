import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchFundamentusIndicators, fetchFundamentusProventos } from "@/lib/investments/fundamentus";

const BRAPI_BASE = "https://brapi.dev/api";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "").replace(/[^A-Z0-9.\-]/gi, "");
  if (!symbol) return NextResponse.json({ error: "No symbol" }, { status: 400 });

  const brapiToken = process.env.BRAPI_TOKEN!;

  // Fundamentus: fundamentals + dividends. BRAPI: live price, logo, name.
  const [fundRes, proventosRes, brapiRes] = await Promise.allSettled([
    fetchFundamentusIndicators(symbol),
    fetchFundamentusProventos(symbol, 5),
    fetch(`${BRAPI_BASE}/quote/${symbol}?token=${brapiToken}`, { cache: "no-store" }),
  ]);

  const fund = fundRes.status === "fulfilled" ? fundRes.value : null;
  const proventos = proventosRes.status === "fulfilled" ? proventosRes.value : [];

  if (!fund) {
    return NextResponse.json({ error: "Sem dados do Fundamentus para esse ativo" }, { status: 502 });
  }

  // BRAPI: live price, day change, logo, name
  let price: number | null = null;
  let change: number | null = null;
  let changePct: number | null = null;
  let logourl: string | null = null;
  let shortName: string | null = null;

  if (brapiRes.status === "fulfilled" && brapiRes.value.ok) {
    try {
      const data = await brapiRes.value.json();
      const r = (data.results ?? [])[0];
      if (r) {
        price = r.regularMarketPrice ?? null;
        change = r.regularMarketChange ?? null;
        changePct = r.regularMarketChangePercent ?? null;
        logourl = r.logourl ?? null;
        shortName = r.longName ?? r.shortName ?? null;
      }
    } catch { /* ignore */ }
  }

  // Map Fundamentus data to the BolsaiData interface expected by indicators-client.tsx.
  // Financial fields (netDebt, equity, ebitda, etc.) are in R$ thousands — the client
  // multiplies by 1000 via fmtFin(). marketCap is multiplied here to give actual R$
  // because the client formats it with fmtLarge() which does not multiply.
  const bolsai = {
    ticker: symbol,
    corporate_name: shortName ?? symbol,
    // Valuation
    pl: fund.pl ?? undefined,
    pvp: fund.pvp ?? undefined,
    ev_ebitda: fund.evEbitda ?? undefined,
    ev_ebit: fund.evEbit ?? undefined,
    p_ebitda: fund.pEbitda ?? undefined,
    p_ebit: fund.pEbit ?? undefined,
    p_sr: fund.psr ?? undefined,
    p_assets: fund.pAtivo ?? undefined,
    lpa: fund.lpa ?? undefined,
    vpa: fund.vpa ?? undefined,
    market_cap: fund.marketCap != null ? fund.marketCap * 1000 : undefined,
    // Margins (already in %)
    gross_margin: fund.margBruta ?? undefined,
    net_margin: fund.margLiquida ?? undefined,
    ebitda_margin: fund.margEbitda ?? undefined,
    ebit_margin: fund.margEbit ?? undefined,
    // Returns (already in %)
    roe: fund.roe ?? undefined,
    roa: undefined, // not available on Fundamentus
    roic: fund.roic ?? undefined,
    ebit_over_assets: fund.ebit != null && fund.totalAssets != null && fund.totalAssets !== 0
      ? (fund.ebit / fund.totalAssets) * 100 : undefined,
    asset_turnover: fund.giroAtivo ?? undefined,
    // CAGR not available on Fundamentus
    cagr_revenue_5y: undefined,
    cagr_earnings_5y: undefined,
    // Debt / Liquidity (dimensionless ratios — units cancel)
    current_ratio: fund.liqCorrente ?? undefined,
    debt_equity: fund.divBrutaPl ?? undefined,
    net_debt_equity: fund.netDebt != null && fund.equity != null && fund.equity !== 0
      ? fund.netDebt / fund.equity : undefined,
    net_debt_ebitda: fund.netDebt != null && fund.ebitda != null && fund.ebitda !== 0
      ? fund.netDebt / fund.ebitda : undefined,
    net_debt_ebit: fund.netDebt != null && fund.ebit != null && fund.ebit !== 0
      ? fund.netDebt / fund.ebit : undefined,
    // Financials in R$ thousands (client multiplies ×1000 internally)
    net_income: fund.netIncome ?? undefined,
    equity: fund.equity ?? undefined,
    net_revenue: fund.netRevenue ?? undefined,
    total_debt: fund.totalDebt ?? undefined,
    ebitda: fund.ebitda ?? undefined,
    ebit: fund.ebit ?? undefined,
    net_debt: fund.netDebt ?? undefined,
    cash: fund.cash ?? undefined,
    total_assets: fund.totalAssets ?? undefined,
  };

  // Map proventos to CashDividend format for the indicators client
  const cashDividends = proventos.map(p => ({
    paymentDate: `${p.paymentDate}T00:00:00.000Z`,
    rate: p.rate,
    label: p.label,
    lastDatePrior: `${p.exDate}T00:00:00.000Z`,
  }));

  return NextResponse.json({ bolsai, price, change, changePct, logourl, shortName, cashDividends });
}

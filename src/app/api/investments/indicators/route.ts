import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BRAPI_BASE = "https://brapi.dev/api";
const BOLSAI_BASE = "https://api.usebolsai.com";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "").replace(/[^A-Z0-9.\-]/gi, "");
  if (!symbol) return NextResponse.json({ error: "No symbol" }, { status: 400 });

  const brapiToken = process.env.BRAPI_TOKEN!;
  const bolsaiKey = process.env.BOLSAI_API_KEY!;

  // Fetch brapi fundamentals and bolsai in parallel
  const [brapiRes, bolsaiRes] = await Promise.allSettled([
    fetch(`${BRAPI_BASE}/quote/${symbol}?token=${brapiToken}&fundamental=true`, { cache: "no-store" }),
    fetch(`${BOLSAI_BASE}/v1/fundamentals?ticker=${symbol}`, {
      headers: {
        Authorization: `Bearer ${bolsaiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    }),
  ]);

  // Parse brapi
  let fundamentals: Record<string, unknown> | null = null;
  let brapiError: string | null = null;
  if (brapiRes.status === "fulfilled" && brapiRes.value.ok) {
    try {
      const data = await brapiRes.value.json();
      const r = (data.results ?? [])[0];
      if (r) {
        fundamentals = {
          symbol: r.symbol ?? symbol,
          shortName: r.shortName ?? symbol,
          longName: r.longName ?? null,
          currency: r.currency ?? "BRL",
          regularMarketPrice: r.regularMarketPrice ?? null,
          regularMarketChange: r.regularMarketChange ?? null,
          regularMarketChangePercent: r.regularMarketChangePercent ?? null,
          marketCap: r.marketCap ?? null,
          enterpriseValue: r.enterpriseValue ?? null,
          // Valuation
          priceEarnings: r.priceEarnings ?? null,
          priceToBook: r.priceToBook ?? null,
          priceToSalesTrailing12Months: r.priceToSalesTrailing12Months ?? null,
          dividendYield: r.dividendYield ?? null,
          dividendsPerShare: r.dividendsPerShare ?? null,
          beta: r.beta ?? null,
          pegRatio: r.pegRatio ?? null,
          forwardPE: r.forwardPE ?? null,
          // Rentabilidade
          returnOnEquity: r.returnOnEquity ?? null,
          returnOnAssets: r.returnOnAssets ?? null,
          profitMargins: r.profitMargins ?? null,
          operatingMargins: r.operatingMargins ?? null,
          grossMargins: r.grossMargins ?? null,
          ebitdaMargins: r.ebitdaMargins ?? null,
          // Crescimento
          revenueGrowth: r.revenueGrowth ?? null,
          earningsGrowth: r.earningsGrowth ?? null,
          // Por Ação
          earningsPerShare: r.earningsPerShare ?? null,
          bookValue: r.bookValue ?? null,
          revenuePerShare: r.revenuePerShare ?? null,
          // Liquidez e Dívida
          currentRatio: r.currentRatio ?? null,
          quickRatio: r.quickRatio ?? null,
          totalCash: r.totalCash ?? null,
          totalDebt: r.totalDebt ?? null,
          totalRevenue: r.totalRevenue ?? null,
          ebitda: r.ebitda ?? null,
          // Médias
          fiftyDayAverage: r.fiftyDayAverage ?? null,
          twoHundredDayAverage: r.twoHundredDayAverage ?? null,
          fiftyTwoWeekHigh: r.fiftyTwoWeekHigh ?? null,
          fiftyTwoWeekLow: r.fiftyTwoWeekLow ?? null,
          logourl: r.logourl ?? null,
        };
      }
    } catch {
      brapiError = "Erro ao parsear resposta brapi";
    }
  } else if (brapiRes.status === "fulfilled") {
    brapiError = `brapi HTTP ${brapiRes.value.status}`;
  } else {
    brapiError = "Erro de rede (brapi)";
  }

  // Parse bolsai — flexible, return raw response for debugging
  let bolsaiData: unknown = null;
  let bolsaiError: string | null = null;
  if (bolsaiRes.status === "fulfilled") {
    try {
      const raw = await bolsaiRes.value.text();
      if (bolsaiRes.value.ok) {
        bolsaiData = JSON.parse(raw);
      } else {
        bolsaiError = `bolsai HTTP ${bolsaiRes.value.status}: ${raw.slice(0, 200)}`;
      }
    } catch {
      bolsaiError = "Erro ao parsear resposta bolsai";
    }
  } else {
    bolsaiError = "Erro de rede (bolsai)";
  }

  if (!fundamentals && !bolsaiData) {
    return NextResponse.json(
      { error: brapiError ?? "Sem dados", bolsaiError },
      { status: 502 }
    );
  }

  return NextResponse.json({ fundamentals, bolsaiData, bolsaiError });
}

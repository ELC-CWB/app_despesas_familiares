import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BRAPI_BASE = "https://brapi.dev/api";
const BOLSAI_BASE = "https://api.usebolsai.com/api/v1";
const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "").replace(/[^A-Z0-9.\-]/gi, "");
  if (!symbol) return NextResponse.json({ error: "No symbol" }, { status: 400 });

  const brapiToken = process.env.BRAPI_TOKEN!;
  const bolsaiKey = process.env.BOLSAI_API_KEY!;

  // Fetch bolsai + brapi + Yahoo Finance in parallel
  const [bolsaiRes, brapiRes, yahooRes] = await Promise.allSettled([
    fetch(`${BOLSAI_BASE}/fundamentals/${symbol}`, {
      headers: { "X-API-Key": bolsaiKey },
      cache: "no-store",
    }),
    fetch(`${BRAPI_BASE}/quote/${symbol}?token=${brapiToken}&dividends=true`, {
      cache: "no-store",
    }),
    fetch(`${YAHOO_BASE}/${symbol}.SA?events=div&range=5y&interval=1mo`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    }),
  ]);

  // Parse bolsai — primary source
  let bolsai: Record<string, unknown> | null = null;
  let bolsaiError: string | null = null;
  if (bolsaiRes.status === "fulfilled") {
    if (bolsaiRes.value.ok) {
      try { bolsai = await bolsaiRes.value.json(); }
      catch { bolsaiError = "Erro ao parsear resposta bolsai"; }
    } else {
      const body = await bolsaiRes.value.text().catch(() => "");
      bolsaiError = `bolsai HTTP ${bolsaiRes.value.status}: ${body.slice(0, 200)}`;
    }
  } else {
    bolsaiError = "Erro de rede (bolsai)";
  }

  // Parse brapi — price, logo, and dividends history
  let price: number | null = null;
  let change: number | null = null;
  let changePct: number | null = null;
  let logourl: string | null = null;
  let shortName: string | null = null;
  let cashDividends: Array<{
    paymentDate: string;
    rate: number;
    label: string;
    lastDatePrior: string;
  }> = [];

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
        cashDividends = (r.dividendsData?.cashDividends ?? []).map(
          (d: { paymentDate: string; rate: number; label: string; lastDatePrior: string }) => ({
            paymentDate: d.paymentDate,
            rate: d.rate,
            label: d.label,
            lastDatePrior: d.lastDatePrior,
          })
        );
      }
    } catch { /* ignore brapi parse error */ }
  }

  // brapi blocks dividends=true for most tickers on free plan — fallback to Yahoo Finance
  if (cashDividends.length === 0 && yahooRes.status === "fulfilled" && yahooRes.value.ok) {
    try {
      const yahooData = await yahooRes.value.json();
      const rawDivs: Record<string, { date: number; amount: number }> =
        yahooData.chart?.result?.[0]?.events?.dividends ?? {};
      cashDividends = Object.values(rawDivs).map(d => ({
        paymentDate: new Date(d.date * 1000).toISOString(),
        rate: d.amount,
        label: "Dividendo",
        lastDatePrior: "",
      }));
      // Also use Yahoo price if brapi gave nothing
      if (price == null) {
        price = yahooData.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
      }
    } catch { /* ignore */ }
  }

  if (!bolsai) {
    return NextResponse.json({ error: bolsaiError ?? "Sem dados" }, { status: 502 });
  }

  return NextResponse.json({
    bolsai,
    price,
    change,
    changePct,
    logourl,
    shortName,
    cashDividends,
  });
}

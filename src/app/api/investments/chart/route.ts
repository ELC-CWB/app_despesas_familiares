import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_RANGES = ["1d", "5d", "1mo", "3mo", "1y", "2y", "5y", "10y"];
const VALID_INTERVALS = ["30m", "1h", "1d", "1wk", "1mo", "3mo"];
const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const BRAPI_BASE = "https://brapi.dev/api";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const symbol = (params.get("symbol") ?? "").replace(/[^A-Z0-9.\-]/gi, "");
  const range = VALID_RANGES.includes(params.get("range") ?? "") ? params.get("range")! : "1mo";
  const interval = VALID_INTERVALS.includes(params.get("interval") ?? "") ? params.get("interval")! : "1d";

  if (!symbol) return NextResponse.json({ error: "No symbol" }, { status: 400 });

  const token = process.env.BRAPI_TOKEN!;

  const [yahooRes, brapiRes] = await Promise.allSettled([
    fetch(`${YAHOO_BASE}/${symbol}.SA?range=${range}&interval=${interval}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    }),
    fetch(`${BRAPI_BASE}/quote/${symbol}?token=${token}`, {
      signal: AbortSignal.timeout(5000),
    }),
  ]);

  if (yahooRes.status === "rejected" || !yahooRes.value.ok) {
    return NextResponse.json({ error: "Erro ao carregar dados históricos" }, { status: 502 });
  }

  let yahooData: unknown;
  try {
    yahooData = await yahooRes.value.json();
  } catch {
    return NextResponse.json({ error: "Resposta inválida do Yahoo Finance" }, { status: 502 });
  }

  const yahooResult = (yahooData as { chart?: { result?: unknown[] } })?.chart?.result?.[0] as {
    meta?: Record<string, number | string>;
    timestamp?: (number | null)[];
    indicators?: {
      quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[];
      adjclose?: { adjclose?: (number | null)[] }[];
    };
  } | undefined;

  if (!yahooResult || !yahooResult.timestamp?.length) {
    return NextResponse.json({ error: "Sem dados para este ativo no período selecionado", code: "INVALID_RANGE" }, { status: 404 });
  }

  // Fetch operations for this symbol to mark buy/sell points on the chart
  const { data: opsData } = await supabase
    .from("investment_operations")
    .select("operation_date, quantity, price, operation_type")
    .eq("profile_id", user.id)
    .eq("symbol", symbol)
    .order("operation_date", { ascending: true });

  const operations = (opsData ?? []).map((op) => ({
    date: op.operation_date as string,
    quantity: op.quantity as number,
    price: op.price as number,
    type: op.operation_type as "BUY" | "SELL",
  }));

  const meta = yahooResult.meta ?? {};
  const timestamps = yahooResult.timestamp ?? [];
  const quote = yahooResult.indicators?.quote?.[0] ?? {};
  const adjcloseArr = yahooResult.indicators?.adjclose?.[0]?.adjclose ?? [];

  const historicalDataPrice = timestamps
    .map((ts, i) => ({
      date: ts as number,
      open: quote.open?.[i] ?? 0,
      high: quote.high?.[i] ?? 0,
      low: quote.low?.[i] ?? 0,
      close: quote.close?.[i] ?? 0,
      volume: quote.volume?.[i] ?? 0,
      adjustedClose: adjcloseArr[i] ?? undefined,
    }))
    .filter((p) => p.close != null && (p.close as number) > 0);

  let shortName = symbol;
  let logourl: string | null = null;
  if (brapiRes.status === "fulfilled" && brapiRes.value.ok) {
    try {
      const brapiData = await brapiRes.value.json();
      const r = brapiData.results?.[0];
      if (r) {
        shortName = r.longName ?? r.shortName ?? symbol;
        logourl = r.logourl ?? null;
      }
    } catch { /* fallback to symbol */ }
  }

  const regularMarketPrice = (meta.regularMarketPrice as number) ?? 0;
  const chartPreviousClose = (meta.chartPreviousClose as number) ?? (meta.previousClose as number) ?? 0;
  const regularMarketChange =
    (meta.regularMarketChange as number) ??
    (chartPreviousClose > 0 ? regularMarketPrice - chartPreviousClose : 0);
  const regularMarketChangePercent =
    (meta.regularMarketChangePercent as number) ??
    (chartPreviousClose > 0 ? (regularMarketChange / chartPreviousClose) * 100 : 0);

  return NextResponse.json({
    symbol,
    shortName,
    logourl,
    currency: (meta.currency as string) ?? "BRL",
    regularMarketPrice,
    regularMarketChange,
    regularMarketChangePercent,
    historicalDataPrice,
    operations,
  });
}

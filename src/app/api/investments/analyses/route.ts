import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BRAPI_BASE = "https://brapi.dev/api";

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
      { cache: "no-store" }
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

    // DPA last 12 months (paid only, not future)
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

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = request.nextUrl.searchParams.get("symbols") ?? "";
  const symbols = raw
    .replace(/[^A-Z0-9,.\-]/gi, "")
    .split(",")
    .filter(Boolean);

  if (symbols.length === 0) return NextResponse.json({ results: [] });

  const token = process.env.BRAPI_TOKEN!;
  const results = await Promise.all(symbols.map(s => fetchTicker(s, token)));

  return NextResponse.json({ results });
}

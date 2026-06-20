import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_RANGES = ["1d", "5d", "1mo", "3mo", "1y", "2y", "5y", "10y"];
const VALID_INTERVALS = ["30m", "1h", "1d", "1wk", "1mo", "3mo"];

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
  const url = `https://brapi.dev/api/quote/${symbol}?range=${range}&interval=${interval}&token=${token}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json({ error: `brapi HTTP ${res.status}`, detail: body.slice(0, 300) }, { status: 502 });
    }
    const data = await res.json();
    if (data.error) {
      return NextResponse.json(
        { error: data.message ?? "brapi error", code: data.code ?? null },
        { status: 502 }
      );
    }

    const result = (data.results ?? [])[0];
    if (!result) return NextResponse.json({ error: "No data" }, { status: 404 });

    return NextResponse.json({
      symbol: result.symbol,
      shortName: result.shortName ?? symbol,
      currency: result.currency ?? "BRL",
      regularMarketPrice: result.regularMarketPrice,
      regularMarketChange: result.regularMarketChange,
      regularMarketChangePercent: result.regularMarketChangePercent,
      historicalDataPrice: result.historicalDataPrice ?? [],
    });
  } catch (err) {
    return NextResponse.json({ error: "Network error", detail: String(err) }, { status: 503 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchFundamentusProventos } from "@/lib/investments/fundamentus";

type DividendRecord = {
  label: string;
  paymentDate: string;
  lastDatePrior: string;
  rate: number;
};

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const symbol = request.nextUrl.searchParams.get("symbol")?.toUpperCase().trim();
  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  // Find the user's first BUY date for this symbol
  const { data: ops } = await supabase
    .from("investment_operations")
    .select("operation_date")
    .eq("profile_id", user.id)
    .eq("symbol", symbol)
    .eq("operation_type", "BUY")
    .order("operation_date", { ascending: true })
    .limit(1);

  const firstBuyDate: string | null = (ops ?? [])[0]?.operation_date ?? null;

  const proventos = await fetchFundamentusProventos(symbol, 10);

  const dividends: DividendRecord[] = proventos
    .map(p => ({
      label: p.label,
      paymentDate: `${p.paymentDate}T00:00:00.000Z`,
      lastDatePrior: `${p.exDate}T00:00:00.000Z`,
      rate: p.rate,
    }))
    .filter(d => !firstBuyDate || d.paymentDate.slice(0, 10) >= firstBuyDate)
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
    .slice(0, 120);

  return NextResponse.json({ symbol, dividends });
}

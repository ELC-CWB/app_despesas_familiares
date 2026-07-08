import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchFundamentusProventos } from "@/lib/investments/fundamentus";

export type UpcomingDividend = {
  symbol: string;
  type: string;
  paymentDate: string;
  value: number;
  estimatedTotal: number | null;
  quantity: number | null;
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: ops } = await supabase
    .from("investment_operations")
    .select("symbol, quantity, operation_type")
    .eq("profile_id", user.id);

  if (!ops?.length) return NextResponse.json({ upcoming: [] });

  // Compute current quantity per symbol
  const quantities: Record<string, number> = {};
  for (const op of ops) {
    if (!quantities[op.symbol]) quantities[op.symbol] = 0;
    quantities[op.symbol] += op.operation_type === "BUY" ? Number(op.quantity) : -Number(op.quantity);
  }
  const symbols = Object.entries(quantities)
    .filter(([, qty]) => qty > 0.0001)
    .map(([sym]) => sym);

  if (!symbols.length) return NextResponse.json({ upcoming: [] });

  const today = new Date().toISOString().slice(0, 10);
  const upcoming: UpcomingDividend[] = [];

  // Fundamentus proventos includes future announced dividends.
  // yearsBack=1 captures ex-dates from the last year (some already passed but payment is upcoming).
  await Promise.allSettled(
    symbols.map(async (symbol) => {
      try {
        const proventos = await fetchFundamentusProventos(symbol, 1);
        for (const p of proventos) {
          if (p.paymentDate && p.paymentDate >= today) {
            const qty = quantities[symbol] ?? null;
            upcoming.push({
              symbol,
              type: p.label ?? "DIVIDENDO",
              paymentDate: p.paymentDate,
              value: p.rate,
              estimatedTotal: qty ? p.rate * qty : null,
              quantity: qty,
            });
          }
        }
      } catch { /* skip symbol */ }
    })
  );

  upcoming.sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));

  return NextResponse.json({ upcoming });
}

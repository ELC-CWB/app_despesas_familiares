import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BRAPI_BASE = "https://brapi.dev/api";

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
  const token = process.env.BRAPI_TOKEN ?? "";
  const upcoming: UpcomingDividend[] = [];

  await Promise.allSettled(
    symbols.map(async (symbol) => {
      try {
        const res = await fetch(`${BRAPI_BASE}/quote/${symbol}?token=${token}&dividends=true`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return;
        const data = await res.json();
        const cashDividends: { type: string; paymentDate: string; value: number }[] =
          data.results?.[0]?.dividendsData?.cashDividends ?? [];

        for (const d of cashDividends) {
          if (d.paymentDate && d.paymentDate >= today) {
            const qty = quantities[symbol] ?? null;
            upcoming.push({
              symbol,
              type: d.type ?? "DIVIDENDO",
              paymentDate: d.paymentDate,
              value: d.value ?? 0,
              estimatedTotal: qty ? (d.value ?? 0) * qty : null,
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

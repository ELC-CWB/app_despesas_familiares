import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchFundamentusIndicators, fetchFundamentusProventos } from "@/lib/investments/fundamentus";
import { getYahooAuth, yahooV7Fetch } from "@/lib/investments/yahoo-auth";

type OperationRow = {
  id: string;
  symbol: string;
  company_name: string | null;
  operation_date: string;
  quantity: number;
  price: number;
  total: number;
  operation_type: "BUY" | "SELL";
  notes: string | null;
};

type Position = {
  symbol: string;
  company_name: string;
  logourl: string | null;
  sector: string | null;
  quantity: number;
  avgPrice: number;
  totalInvested: number;
  currentPrice: number;
  currentValue: number;
  gain: number;
  gainPercent: number;
  dividends12m: number;
  dpa12m: number;
  dy12m: number;
};

// Normalized dividend record used internally
type DivRecord = { exDate: string; rate: number };

type PriceRecord = {
  price: number;
  name: string;
  logourl: string | null;
  sector: string | null;
  divHistory: DivRecord[]; // all available historical dividends
};

async function fetchPrices(symbols: string[]): Promise<Record<string, PriceRecord>> {
  if (!symbols.length) return {};

  type FundData = { price: number; divHistory: DivRecord[] };
  const fundMap: Record<string, FundData> = {};
  const yahooMap: Record<string, { name: string; sector: string | null }> = {};

  const yahooFetch = async () => {
    try {
      const auth = await getYahooAuth();
      const res = await yahooV7Fetch(symbols, "shortName,longName,sector", auth, 8000);
      if (!res.ok) return;
      const data = await res.json();
      const results: { symbol: string; shortName?: string; longName?: string; sector?: string }[] =
        data?.quoteResponse?.result ?? [];
      for (const r of results) {
        const sym = r.symbol.replace(/\.SA$/i, "").toUpperCase();
        yahooMap[sym] = { name: r.longName ?? r.shortName ?? sym, sector: r.sector ?? null };
      }
    } catch { /* skip */ }
  };

  // Fundamentus: price + 10y dividend history. Yahoo Finance: name + sector (single batch).
  await Promise.allSettled([
    ...symbols.map(async (sym) => {
      const [fundRes, proventosRes] = await Promise.allSettled([
        fetchFundamentusIndicators(sym),
        fetchFundamentusProventos(sym, 10),
      ]);
      const price = fundRes.status === "fulfilled" ? (fundRes.value?.price ?? 0) : 0;
      const proventos = proventosRes.status === "fulfilled" ? proventosRes.value : [];
      fundMap[sym] = {
        price,
        divHistory: proventos.map(p => ({ exDate: p.exDate, rate: p.rate })),
      };
    }),
    yahooFetch(),
  ]);

  const results: Record<string, PriceRecord> = {};
  for (const sym of symbols) {
    const f = fundMap[sym] ?? { price: 0, divHistory: [] };
    const y = yahooMap[sym];
    results[sym] = {
      price: f.price,
      name: y?.name ?? sym,
      logourl: null,
      sector: y?.sector ?? null,
      divHistory: f.divHistory,
    };
  }
  return results;
}

// Computes actual dividends received: for each historical dividend, multiplies the
// rate by the number of shares held BEFORE that ex-date (user must own before ex-date).
function computeEffectiveDividends(symOps: OperationRow[], divHistory: DivRecord[]): number {
  if (!divHistory.length) return 0;
  const sorted = [...symOps].sort((a, b) => a.operation_date.localeCompare(b.operation_date));
  const firstBuy = sorted.find(op => op.operation_type === "BUY")?.operation_date;
  if (!firstBuy) return 0;

  // Returns quantity held strictly before `date` (i.e., at close of previous trading day)
  function qtyBefore(date: string): number {
    let qty = 0;
    for (const op of sorted) {
      if (op.operation_date >= date) break;
      qty += op.operation_type === "BUY" ? op.quantity : -op.quantity;
    }
    return Math.max(0, qty);
  }

  return divHistory.reduce((sum, d) => {
    if (!d.exDate || d.exDate < firstBuy) return sum;
    const qty = qtyBefore(d.exDate);
    return sum + qty * d.rate;
  }, 0);
}

function computePositions(operations: OperationRow[], prices: Record<string, PriceRecord>): Position[] {
  const bySymbol: Record<string, { totalCost: number; quantity: number; company_name: string }> = {};
  const opsBySymbol: Record<string, OperationRow[]> = {};

  for (const op of operations) {
    if (!bySymbol[op.symbol]) bySymbol[op.symbol] = { totalCost: 0, quantity: 0, company_name: op.company_name ?? op.symbol };
    (opsBySymbol[op.symbol] ??= []).push(op);
    if (op.operation_type === "BUY") {
      bySymbol[op.symbol].totalCost += op.total;
      bySymbol[op.symbol].quantity += op.quantity;
    } else {
      const avg = bySymbol[op.symbol].quantity > 0 ? bySymbol[op.symbol].totalCost / bySymbol[op.symbol].quantity : 0;
      bySymbol[op.symbol].quantity -= op.quantity;
      bySymbol[op.symbol].totalCost -= avg * op.quantity;
    }
    if (op.company_name) bySymbol[op.symbol].company_name = op.company_name;
  }

  return Object.entries(bySymbol)
    .filter(([, v]) => v.quantity > 0.0001)
    .map(([symbol, v]) => {
      const priceData = prices[symbol];
      const avgPrice = v.quantity > 0 ? v.totalCost / v.quantity : 0;
      const totalInvested = v.quantity * avgPrice;
      const currentPrice = priceData?.price ?? 0;
      const currentValue = v.quantity * currentPrice;
      const gain = currentValue - totalInvested;
      const gainPercent = totalInvested > 0 ? (gain / totalInvested) * 100 : 0;
      const dividendsReceived = computeEffectiveDividends(
        opsBySymbol[symbol] ?? [],
        priceData?.divHistory ?? []
      );
      const dy12m = totalInvested > 0 ? (dividendsReceived / totalInvested) * 100 : 0;
      return {
        symbol,
        company_name: priceData?.name ?? v.company_name,
        logourl: priceData?.logourl ?? null,
        sector: priceData?.sector ?? null,
        quantity: v.quantity,
        avgPrice,
        totalInvested,
        currentPrice,
        currentValue,
        gain,
        gainPercent,
        dividends12m: dividendsReceived,
        dpa12m: 0,
        dy12m,
      };
    })
    .sort((a, b) => b.currentValue - a.currentValue);
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Determine if the user is a non-admin group member (views admin's portfolio read-only)
  let targetProfileId = user.id;
  let isReadOnly = false;
  let ownerName: string | null = null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("investment_group_id")
    .eq("id", user.id)
    .single();

  if (profile?.investment_group_id) {
    const { data: group } = await supabase
      .from("investment_groups")
      .select("created_by")
      .eq("id", profile.investment_group_id)
      .single();

    if (group && group.created_by !== user.id) {
      targetProfileId = group.created_by;
      isReadOnly = true;
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", group.created_by)
        .single();
      ownerName = adminProfile?.name ?? null;
    }
  }

  const { data: ops, error } = await supabase
    .from("investment_operations")
    .select("*")
    .eq("profile_id", targetProfileId)
    .order("operation_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const operations = (ops ?? []) as OperationRow[];
  const symbols = [...new Set(operations.map((o) => o.symbol))];
  const prices = await fetchPrices(symbols);
  const positions = computePositions(operations, prices);

  const totalInvested = positions.reduce((s, p) => s + p.totalInvested, 0);
  const currentValue = positions.reduce((s, p) => s + p.currentValue, 0);
  const gain = currentValue - totalInvested;
  const gainPercent = totalInvested > 0 ? (gain / totalInvested) * 100 : 0;
  const totalDividends12m = positions.reduce((s, p) => s + p.dividends12m, 0);
  const totalReturn = gain + totalDividends12m;
  const totalReturnPercent = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;

  return NextResponse.json({
    operations,
    positions,
    totals: { totalInvested, currentValue, gain, gainPercent, totalDividends12m, totalReturn, totalReturnPercent },
    isReadOnly,
    ownerName,
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { symbol, company_name, operation_date, quantity, price, operation_type, origem_recursos, notes } = body;
  const VALID_ORIGEM = ["APORTE", "REALOCACAO", "PROVENTO"];
  const origemValue = VALID_ORIGEM.includes(origem_recursos) ? origem_recursos : "APORTE";

  if (!symbol || !operation_date || !quantity || !price || !operation_type)
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const total = Math.round(quantity * price * 100) / 100;

  const { data, error } = await supabase
    .from("investment_operations")
    .insert({
      profile_id: user.id,
      symbol: String(symbol).toUpperCase().trim(),
      company_name: company_name ?? null,
      operation_date,
      quantity: Number(quantity),
      price: Number(price),
      total,
      operation_type,
      origem_recursos: origemValue,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await request.json();
  const { symbol, company_name, operation_date, quantity, price, operation_type, origem_recursos, notes } = body;
  const VALID_ORIGEM = ["APORTE", "REALOCACAO", "PROVENTO"];
  const origemValue = VALID_ORIGEM.includes(origem_recursos) ? origem_recursos : "APORTE";

  if (!symbol || !operation_date || !quantity || !price || !operation_type)
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const total = Math.round(Number(quantity) * Number(price) * 100) / 100;

  const { data, error } = await supabase
    .from("investment_operations")
    .update({
      symbol: String(symbol).toUpperCase().trim(),
      company_name: company_name ?? null,
      operation_date,
      quantity: Number(quantity),
      price: Number(price),
      total,
      operation_type,
      origem_recursos: origemValue,
      notes: notes ?? null,
    })
    .eq("id", id)
    .eq("profile_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase
    .from("investment_operations")
    .delete()
    .eq("id", id)
    .eq("profile_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

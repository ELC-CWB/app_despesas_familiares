import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioSummary } from "@/lib/investments/portfolio-summary";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const summary = await getPortfolioSummary(supabase, user.id);
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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

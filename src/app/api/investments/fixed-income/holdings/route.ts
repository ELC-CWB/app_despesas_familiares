import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFixedIncomeSummary, type FixedIncomeIndexador, type FixedIncomeTipo } from "@/lib/investments/fixed-income-summary";

const VALID_TIPO: FixedIncomeTipo[] = [
  "CDB", "LCI", "LCA", "TESOURO_SELIC", "TESOURO_IPCA", "TESOURO_PREFIXADO",
  "DEBENTURE", "CRI", "CRA", "OUTRO",
];
const VALID_INDEXADOR: FixedIncomeIndexador[] = ["CDI", "SELIC", "IPCA", "PREFIXADO"];

function validateBody(body: Record<string, unknown>) {
  const { tipo, indexador, taxa, principal, application_date, maturity_date } = body;

  if (!VALID_TIPO.includes(tipo as FixedIncomeTipo)) return "Tipo inválido";
  if (!VALID_INDEXADOR.includes(indexador as FixedIncomeIndexador)) return "Indexador inválido";
  if (typeof taxa !== "number" || !Number.isFinite(taxa) || taxa < 0) return "Taxa inválida";
  if (typeof principal !== "number" || !Number.isFinite(principal) || principal <= 0) return "Valor aplicado inválido";
  if (!application_date || typeof application_date !== "string") return "Data de aplicação obrigatória";
  if (!maturity_date || typeof maturity_date !== "string") return "Data de vencimento obrigatória";
  if (maturity_date < application_date) return "Vencimento não pode ser antes da aplicação";
  return null;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const summary = await getFixedIncomeSummary(supabase, user.id);
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
  const validationError = validateBody(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const { tipo, institution, indexador, taxa, principal, application_date, maturity_date, notes } = body;

  const { data, error } = await supabase
    .from("fixed_income_holdings")
    .insert({
      profile_id: user.id,
      tipo, institution: institution ?? null, indexador,
      taxa: Number(taxa), principal: Number(principal),
      application_date, maturity_date, notes: notes ?? null,
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
  const validationError = validateBody(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const { tipo, institution, indexador, taxa, principal, application_date, maturity_date, notes } = body;

  const { data, error } = await supabase
    .from("fixed_income_holdings")
    .update({
      tipo, institution: institution ?? null, indexador,
      taxa: Number(taxa), principal: Number(principal),
      application_date, maturity_date, notes: notes ?? null,
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
    .from("fixed_income_holdings")
    .delete()
    .eq("id", id)
    .eq("profile_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

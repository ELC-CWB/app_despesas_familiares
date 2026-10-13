import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveInvestmentTarget } from "@/lib/investments/investment-group";
import { hasInvestmentsAccess } from "@/lib/investments-access";
import { validarOnboarding } from "@/lib/carteira/validacao";
import type { OnboardingEntrada } from "@/lib/carteira/tipos";

// Conclui os Primeiros passos: estrutura + plano v1 + compras iniciais, numa transação.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  if (!await hasInvestmentsAccess(supabase, user.id)) {
    return NextResponse.json({ error: "Sem acesso ao módulo de investimentos." }, { status: 403 });
  }

  const { isReadOnly } = await resolveInvestmentTarget(supabase, user.id);
  if (isReadOnly) {
    return NextResponse.json({ error: "Você está vendo a carteira do administrador do grupo, somente leitura." }, { status: 403 });
  }

  const entrada = (await request.json()) as OnboardingEntrada;
  const erro = validarOnboarding(entrada);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });

  const { error } = await supabase.rpc("carteira_concluir_onboarding", { p: entrada });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true }, { status: 201 });
}

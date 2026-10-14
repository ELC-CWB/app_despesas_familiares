import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { hasInvestmentsAccess } from "@/lib/investments-access";
import { resolveInvestmentTarget } from "@/lib/investments/investment-group";

// Checagens comuns das rotas de gravação da Carteira: sessão, acesso ao módulo e
// não estar vendo a carteira do administrador do grupo (somente leitura).
export async function autorizarEscrita(): Promise<
  { ok: true; supabase: SupabaseClient; user: User } | { ok: false; resposta: NextResponse }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, resposta: NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 }) };
  if (!await hasInvestmentsAccess(supabase, user.id)) {
    return { ok: false, resposta: NextResponse.json({ error: "Sem acesso ao módulo de investimentos." }, { status: 403 }) };
  }
  const { isReadOnly } = await resolveInvestmentTarget(supabase, user.id);
  if (isReadOnly) {
    return { ok: false, resposta: NextResponse.json({ error: "Você está vendo a carteira do administrador do grupo, somente leitura." }, { status: 403 }) };
  }
  return { ok: true, supabase, user };
}

export const erro = (mensagem: string, status = 400) => NextResponse.json({ error: mensagem }, { status });

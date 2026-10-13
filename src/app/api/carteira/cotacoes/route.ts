import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasInvestmentsAccess } from "@/lib/investments-access";
import { getCarteira } from "@/lib/carteira/dados";
import { atualizarCotacoes } from "@/lib/carteira/mercado";
import { tickersNecessarios } from "@/lib/carteira/patrimonio";

// Botão Atualizar: busca agora as cotações (intradiárias, atraso de até 15 min) dos ativos da carteira
// e grava no banco, para todas as telas usarem a mesma última cotação válida.
export const maxDuration = 30;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  if (!await hasInvestmentsAccess(supabase, user.id)) {
    return NextResponse.json({ error: "Sem acesso ao módulo de investimentos." }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Atualização indisponível: falta configurar a chave SUPABASE_SERVICE_ROLE_KEY no servidor." }, { status: 500 });
  }

  const carteira = await getCarteira(supabase, user.id);
  const { ok, falhas } = await atualizarCotacoes(admin, tickersNecessarios(carteira.estrutura.ativos), "5d");
  return NextResponse.json({ ok, falhas, atualizado_em: new Date().toISOString() });
}

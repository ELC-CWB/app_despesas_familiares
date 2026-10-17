import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasInvestmentsAccess } from "@/lib/investments-access";
import { getCarteira } from "@/lib/carteira/dados";
import { lerMovimentacoesIR } from "@/lib/carteira/ir-dados";
import { montarHistorico } from "@/lib/carteira/historico-dados";
import { hojeSP } from "@/lib/carteira/mercado";

// Séries dos gráficos da Visão geral (rentabilidade acumulada). Só leitura: serve também ao membro do grupo
// que vê a carteira do administrador. Os preços vêm do Yahoo e o CDI do Banco Central.
export const maxDuration = 30;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  if (!await hasInvestmentsAccess(supabase, user.id)) {
    return NextResponse.json({ error: "Sem acesso ao módulo de investimentos." }, { status: 403 });
  }

  try {
    const carteira = await getCarteira(supabase, user.id);
    const movs = await lerMovimentacoesIR(supabase, carteira.targetProfileId);
    const resposta = await montarHistorico(
      carteira.estrutura.ativos.map((a) => ({ id: a.id, codigo: a.codigo, ticker_cotacao: a.ticker_cotacao, mercado: a.mercado })),
      movs.map((m) => ({
        data: m.data, tipo: m.tipo, ativo_id: m.ativo_id, quantidade: m.quantidade,
        valor_bruto: m.valor_bruto, cambio_usado: m.cambio_usado, ptax_venda: m.ptax_venda,
      })),
      hojeSP(),
    );
    return NextResponse.json(resposta, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao montar o histórico" }, { status: 500 });
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CarteiraDados } from "@/lib/carteira/dados";
import { hojeSP, lerCotacoes, lerIpca, lerMovimentacoes, lerSnapshots } from "@/lib/carteira/mercado";
import { avaliarCarteira, quantidadesPorAtivo, tickersNecessarios, type Cotacao } from "@/lib/carteira/patrimonio";
import { montarEstadoUsufruto, type EstadoUsufruto, type Retirada } from "@/lib/carteira/usufruto";

export async function lerRetiradas(supabase: SupabaseClient, profileId: string): Promise<Retirada[]> {
  const { data, error } = await supabase
    .from("carteira_retiradas").select("id, vigente_desde, valor_mensal, valor_anterior, motivo, decisao")
    .eq("profile_id", profileId).order("vigente_desde").order("created_at");
  if (error) return []; // sem a tabela (migration da Fase 6 pendente), a tela abre sem histórico
  return (data ?? []).map((r) => ({
    id: r.id, vigente_desde: String(r.vigente_desde), valor_mensal: Number(r.valor_mensal),
    valor_anterior: r.valor_anterior == null ? null : Number(r.valor_anterior), motivo: r.motivo, decisao: r.decisao,
  }));
}

// Patrimônio, valores por ativo e estado do usufruto, calculados no servidor.
// A página e a API usam esta mesma função, então o que o usuário vê é o que a API valida.
export async function carregarUsufruto(
  supabase: SupabaseClient, carteira: CarteiraDados, pre?: { total: number; valores: Record<string, number> },
) {
  const { config, estrutura, targetProfileId } = carteira;
  const ativos = estrutura.ativos;
  const hoje = hojeSP();
  let total: number;
  let valores: Record<string, number>;
  if (pre) {
    ({ total, valores } = pre);
  } else {
    const [cotacoes, movs] = await Promise.all([
      lerCotacoes(supabase, tickersNecessarios(ativos)).catch((): Record<string, Cotacao> => ({})),
      lerMovimentacoes(supabase, targetProfileId),
    ]);
    const av = avaliarCarteira(ativos, quantidadesPorAtivo(movs), cotacoes);
    total = av.total;
    valores = Object.fromEntries(av.itens.map((i) => [i.ativo_id, i.valor]));
  }

  let estado: EstadoUsufruto | null = null;
  let retiradas: Retirada[] = [];
  if (config?.fase === "usufruto" && config.inicio_usufruto) {
    const [r, snaps, ipca] = await Promise.all([
      lerRetiradas(supabase, targetProfileId),
      lerSnapshots(supabase, targetProfileId),
      lerIpca(supabase, Number(config.inicio_usufruto.slice(0, 4))),
    ]);
    retiradas = r;
    estado = montarEstadoUsufruto({
      inicio: config.inicio_usufruto, hoje,
      ativos: ativos.map((a) => ({ id: a.id, codigo: a.codigo, mercado: a.mercado, alvo_pct: a.alvo_pct, banda_pp: a.banda_pp })),
      valores, total, colchaoId: config.colchao_ativo_id, colchaoMinMeses: config.colchao_min_meses,
      regras: {
        protecao_on: config.regra_protecao_on, queda_pct: config.regra_queda_pct, corte_pct: config.regra_corte_pct,
        aumento_on: config.regra_aumento_on, gatilho_pct: config.regra_gatilho_pct, aumento_pct: config.regra_aumento_pct,
      },
      retiradas, ipca: ipca.meses, pontos: snaps.map((s) => ({ data: s.data, patrimonio: s.patrimonio })),
    });
  }
  return { hoje, total, valores, estado, retiradas };
}

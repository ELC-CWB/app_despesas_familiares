import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveInvestmentTarget } from "@/lib/investments/investment-group";
import { COLCHAO_MIN_MESES_PADRAO } from "@/lib/carteira/constantes";
import type { Ativo, Bloco, ConfigCarteira, Corretora, Estrutura, Geografia, Plano } from "@/lib/carteira/tipos";

export type CarteiraDados = {
  targetProfileId: string;
  isReadOnly: boolean; // membro de grupo vendo a carteira do administrador
  ownerName: string | null;
  config: ConfigCarteira | null;
  estrutura: Estrutura;
  plano: Plano | null;
};

// Há algo cadastrado? (os Primeiros passos só aparecem com a carteira vazia)
export function temEstrutura(c: Pick<CarteiraDados, "config" | "estrutura">): boolean {
  const e = c.estrutura;
  return !!c.config?.onboarding_concluido
    || e.geografias.length > 0 || e.blocos.length > 0 || e.corretoras.length > 0 || e.ativos.length > 0;
}

const num = (v: unknown) => (v == null ? 0 : Number(v));
const numOuNull = (v: unknown) => (v == null ? null : Number(v));

// Lê a carteira do usuário (ou do administrador do grupo, em modo somente leitura).
// O RLS garante que só linhas permitidas voltam.
export async function getCarteira(supabase: SupabaseClient, userId: string): Promise<CarteiraDados> {
  const { targetProfileId, isReadOnly, ownerName } = await resolveInvestmentTarget(supabase, userId);
  const doAlvo = <T extends string>(tabela: T) => supabase.from(tabela).select("*").eq("profile_id", targetProfileId);

  const [config, corretoras, geografias, blocos, ativos, plano] = await Promise.all([
    doAlvo("carteira_config").maybeSingle(),
    doAlvo("carteira_corretoras").order("created_at"),
    doAlvo("carteira_geografias").order("ordem"),
    doAlvo("carteira_blocos").order("ordem"),
    doAlvo("carteira_ativos").order("ordem"),
    doAlvo("carteira_planos").eq("em_uso", true).maybeSingle(),
  ]);
  const erro = [config, corretoras, geografias, blocos, ativos, plano].find((r) => r.error)?.error;
  if (erro) throw new Error(erro.message);

  const c = config.data;
  const configCarteira: ConfigCarteira | null = c && {
    fase: c.fase,
    inicio_usufruto: c.inicio_usufruto,
    colchao_ativo_id: c.colchao_ativo_id,
    colchao_min_meses: c.colchao_min_meses ?? COLCHAO_MIN_MESES_PADRAO,
    regra_protecao_on: c.regra_protecao_on,
    regra_queda_pct: num(c.regra_queda_pct),
    regra_corte_pct: num(c.regra_corte_pct),
    regra_aumento_on: c.regra_aumento_on,
    regra_gatilho_pct: num(c.regra_gatilho_pct),
    regra_aumento_pct: num(c.regra_aumento_pct),
    aliquotas: c.aliquotas ?? {},
    onboarding_concluido: c.onboarding_concluido,
  };

  const estrutura: Estrutura = {
    corretoras: (corretoras.data ?? []).map((x): Corretora => ({
      id: x.id, nome: x.nome, mercado: x.mercado,
      corr_br_pct: num(x.corr_br_pct), corr_br_min: num(x.corr_br_min),
      corr_ext_pct: num(x.corr_ext_pct), corr_ext_min_usd: num(x.corr_ext_min_usd),
      emolumentos_pct: num(x.emolumentos_pct), custodia_pct: num(x.custodia_pct),
      spread_pct: num(x.spread_pct), iof_ida_pct: num(x.iof_ida_pct), iof_volta_pct: num(x.iof_volta_pct),
    })),
    geografias: (geografias.data ?? []).map((x): Geografia => ({ id: x.id, nome: x.nome, cor: x.cor, ordem: x.ordem })),
    blocos: (blocos.data ?? []).map((x): Bloco => ({
      id: x.id, geografia_id: x.geografia_id, nome: x.nome, nome_curto: x.nome_curto,
      banda_pp: numOuNull(x.banda_pp), ordem: x.ordem,
    })),
    ativos: (ativos.data ?? []).map((x): Ativo => ({
      id: x.id, codigo: x.codigo, ticker_cotacao: x.ticker_cotacao, tipo: x.tipo, mercado: x.mercado,
      moeda: x.moeda, bloco_id: x.bloco_id, corretora_id: x.corretora_id, gestora: x.gestora,
      alvo_pct: num(x.alvo_pct), banda_pp: numOuNull(x.banda_pp), taxa_adm_pct: num(x.taxa_adm_pct), ordem: x.ordem,
    })),
    config: {
      colchao_ativo_id: configCarteira?.colchao_ativo_id ?? null,
      colchao_min_meses: configCarteira?.colchao_min_meses ?? COLCHAO_MIN_MESES_PADRAO,
      aliquotas: configCarteira?.aliquotas ?? {},
    },
  };

  const p = plano.data;
  const planoEmUso: Plano | null = p && {
    id: p.id, versao: p.versao, em_uso: p.em_uso, ano_inicio: p.ano_inicio,
    patrimonio_inicial: num(p.patrimonio_inicial), aporte_mensal: num(p.aporte_mensal), anos_aporte: p.anos_aporte,
    perpetuo: p.perpetuo, anos_usufruto: p.anos_usufruto, retirada_pct: num(p.retirada_pct),
    rent_pess_pct: num(p.rent_pess_pct), rent_otim_pct: num(p.rent_otim_pct),
  };

  return { targetProfileId, isReadOnly, ownerName, config: configCarteira, estrutura, plano: planoEmUso };
}

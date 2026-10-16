import type { SupabaseClient } from "@supabase/supabase-js";
import type { CarteiraDados } from "@/lib/carteira/dados";
import { ALIQUOTAS_PADRAO } from "@/lib/carteira/constantes";
import {
  apurarAnosExterior, apurarFonte, apurarMesesB3, apurarVendas, type AnoExterior, type AvisoIR, type MesB3, type MesFonte,
  type VendaApurada,
} from "@/lib/carteira/ir";
import type { MovRelatorio } from "@/lib/carteira/ir-relatorio";

export type ApuracaoIR = {
  vendas: VendaApurada[];
  avisos: AvisoIR[];
  meses: MesB3[];
  anosExterior: AnoExterior[];
  fonte: MesFonte[];
  pagos: string[];             // competências (AAAA-MM-01) com o DARF marcado como pago
};

const num = (v: unknown) => (v == null ? 0 : Number(v));

export async function lerMovimentacoesIR(supabase: SupabaseClient, profileId: string): Promise<MovRelatorio[]> {
  const { data, error } = await supabase
    .from("carteira_movimentacoes")
    .select("id, data, tipo, ativo_id, quantidade, valor_bruto, cambio_usado, ptax_compra, ptax_venda, corretagem, emolumentos, outras_taxas, valor_liquido_brl, ir_retido, provento_tipo")
    .eq("profile_id", profileId)
    .range(0, 49999);
  if (error) throw new Error(error.message);
  return (data ?? []).map((m): MovRelatorio => ({
    id: m.id, data: String(m.data), tipo: m.tipo, ativo_id: m.ativo_id,
    quantidade: m.quantidade == null ? null : Number(m.quantidade),
    valor_bruto: num(m.valor_bruto), cambio_usado: m.cambio_usado == null ? null : Number(m.cambio_usado),
    ptax_compra: m.ptax_compra == null ? null : Number(m.ptax_compra), ptax_venda: m.ptax_venda == null ? null : Number(m.ptax_venda),
    corretagem: num(m.corretagem), emolumentos: num(m.emolumentos), outras_taxas: num(m.outras_taxas),
    valor_liquido_brl: num(m.valor_liquido_brl), ir_retido: num(m.ir_retido), provento_tipo: m.provento_tipo ?? null,
  }));
}

export async function lerDarfsPagos(supabase: SupabaseClient, profileId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("carteira_ir_mensal").select("competencia").eq("profile_id", profileId).eq("darf_pago", true);
  if (error) return []; // sem a tabela (migration da Fase 7 pendente), nada fica marcado como pago
  return (data ?? []).map((r) => String(r.competencia));
}

// Apuração completa do IR a partir das movimentações. A página e a API usam esta mesma função.
export async function carregarIR(supabase: SupabaseClient, carteira: CarteiraDados): Promise<ApuracaoIR> {
  const [movs, pagos] = await Promise.all([
    lerMovimentacoesIR(supabase, carteira.targetProfileId),
    lerDarfsPagos(supabase, carteira.targetProfileId),
  ]);
  const aliquotas = { ...ALIQUOTAS_PADRAO, ...carteira.config?.aliquotas };
  const { vendas, avisos } = apurarVendas(
    carteira.estrutura.ativos.map((a) => ({
      id: a.id, codigo: a.codigo, tipo: a.tipo, mercado: a.mercado, aliquota_ir_pct: a.aliquota_ir_pct,
    })),
    movs, aliquotas,
  );
  return { vendas, avisos, meses: apurarMesesB3(vendas), anosExterior: apurarAnosExterior(vendas), fonte: apurarFonte(vendas), pagos };
}

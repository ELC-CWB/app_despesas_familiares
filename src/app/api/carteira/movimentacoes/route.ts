import { NextRequest, NextResponse } from "next/server";
import { autorizarEscrita, erro } from "@/lib/carteira/api";
import { hojeSP, ptaxDoDia } from "@/lib/carteira/mercado";
import { quantidadesPorAtivo } from "@/lib/carteira/patrimonio";

// Registra uma compra, venda ou provento (SPEC §4.4). Os valores vêm calculados da tela
// (custos de REGRAS §5); aqui o servidor confere a consistência, a posição disponível
// para venda e grava a PTAX do dia (base do IR, REGRAS §7).

type Entrada = {
  tipo: "compra" | "venda" | "provento";
  data: string;
  ativo_id: string;
  corretora_id: string | null;
  quantidade: number | null;
  preco_unit: number | null;
  valor_bruto: number;
  cambio_usado: number | null;
  spread_valor: number; iof_valor: number; corretagem: number; emolumentos: number; outras_taxas: number;
  provento_tipo: "dividendo" | "jcp" | "rendimento" | null;
  ir_retido: number;
  ir_estimado: number | null;
  valor_liquido_brl: number;
  observacoes: string | null;
};

const finitoNaoNeg = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;

export async function POST(request: NextRequest) {
  const auth = await autorizarEscrita();
  if (!auth.ok) return auth.resposta;
  const { supabase, user } = auth;

  const m = (await request.json()) as Entrada;
  if (!["compra", "venda", "provento"].includes(m.tipo)) return erro("Tipo de operação inválido.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.data ?? "")) return erro("Informe a data da operação.");
  if (m.data > hojeSP()) return erro("A data não pode estar no futuro.");

  const { data: ativo } = await supabase
    .from("carteira_ativos").select("id, codigo, moeda").eq("id", m.ativo_id).eq("profile_id", user.id).maybeSingle();
  if (!ativo) return erro("Escolha um ativo da carteira.");

  const custos = [m.spread_valor, m.iof_valor, m.corretagem, m.emolumentos, m.outras_taxas, m.ir_retido];
  if (!custos.every(finitoNaoNeg)) return erro("Os custos precisam ser maiores ou iguais a zero.");
  if (!(m.valor_bruto > 0) || !(m.valor_liquido_brl > 0)) return erro("Informe o valor da operação.");

  if (m.tipo === "provento") {
    if (!["dividendo", "jcp", "rendimento"].includes(m.provento_tipo ?? "")) return erro("Escolha o tipo do provento.");
    if (m.ir_retido > m.valor_bruto) return erro("O IR retido não pode ser maior que o valor bruto.");
  } else {
    if (!(Number(m.quantidade) > 0) || !(Number(m.preco_unit) > 0)) return erro("Informe a quantidade de cotas e o valor da cota.");
    if (ativo.moeda !== "BRL" && !(Number(m.cambio_usado) > 0)) return erro("Informe a cotação do dólar da operação.");
  }

  if (m.tipo === "venda") {
    const { data: movs, error } = await supabase
      .from("carteira_movimentacoes").select("ativo_id, tipo, quantidade, valor_liquido_brl, data")
      .eq("profile_id", user.id).eq("ativo_id", ativo.id);
    if (error) return erro(error.message, 500);
    const lista = (movs ?? []).map((x) => ({ ...x, quantidade: x.quantidade == null ? null : Number(x.quantidade), valor_liquido_brl: Number(x.valor_liquido_brl) }));
    const naData = quantidadesPorAtivo(lista.filter((x) => x.data <= m.data))[ativo.id] ?? 0;
    const hoje = quantidadesPorAtivo(lista)[ativo.id] ?? 0;
    const disponivel = Math.min(naData, hoje);
    if (Number(m.quantidade) > disponivel + 1e-9) {
      return erro(`Você tem ${disponivel.toLocaleString("pt-BR", { maximumFractionDigits: 8 })} cotas de ${ativo.codigo} nessa data.`);
    }
  }

  if (m.corretora_id) {
    const { data: c } = await supabase.from("carteira_corretoras").select("id").eq("id", m.corretora_id).eq("profile_id", user.id).maybeSingle();
    if (!c) return erro("Escolha uma corretora da carteira.");
  }

  const ptax = await ptaxDoDia(supabase, m.data).catch(() => null);

  const { data: criada, error } = await supabase.from("carteira_movimentacoes").insert({
    profile_id: user.id,
    data: m.data,
    tipo: m.tipo,
    ativo_id: ativo.id,
    corretora_id: m.corretora_id,
    quantidade: m.tipo === "provento" ? null : m.quantidade,
    preco_unit: m.tipo === "provento" ? null : m.preco_unit,
    moeda: m.tipo === "provento" ? "BRL" : ativo.moeda,
    valor_bruto: m.valor_bruto,
    cambio_usado: ativo.moeda === "BRL" || m.tipo === "provento" ? null : m.cambio_usado,
    ptax_compra: ptax?.compra ?? null,
    ptax_venda: ptax?.venda ?? null,
    spread_valor: m.spread_valor, iof_valor: m.iof_valor, corretagem: m.corretagem,
    emolumentos: m.emolumentos, outras_taxas: m.outras_taxas,
    provento_tipo: m.tipo === "provento" ? m.provento_tipo : null,
    ir_retido: m.ir_retido,
    ir_estimado: m.tipo === "venda" ? m.ir_estimado : null,
    valor_liquido_brl: m.valor_liquido_brl,
    observacoes: m.observacoes?.trim() || null,
  }).select("id").single();
  if (error) return erro(error.message, 500);

  return NextResponse.json({ id: criada.id }, { status: 201 });
}

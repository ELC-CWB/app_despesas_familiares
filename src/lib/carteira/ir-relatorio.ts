// Relatório anual para a declaração (REGRAS §7, parte 2): bens e direitos em 31/12, rendimentos, ganhos
// de capital e apuração do exterior. Funções puras sobre as movimentações; ESTIMATIVA, não substitui o contador.
// Os códigos da ficha vêm de guias de bancos e corretoras (ver CodigoDeclaracao): confira no programa do IRPF.

import {
  apurarAnosExterior, apurarFonte, apurarMesesB3, apurarVendas, NOME_CATEGORIA,
  type AnoExterior, type AtivoIR, type MesB3, type MesFonte, type MovIR, type VendaApurada,
} from "./ir";

export type AtivoRelatorio = AtivoIR & { moeda: string; sede: string | null; gestora: string | null };

// ── Onde declarar (ficha e código do IRPF) ─────────────────────────────────────
// Códigos conforme guias de bancos e corretoras (pesquisa em 15/10/2026), NÃO conferidos no manual da Receita.
// `divergente`: as fontes não concordam; confira no programa do IRPF do ano ou com o contador.

export type CodigoDeclaracao = { ficha: string; codigo: string; descricao: string; divergente: boolean; nota?: string };

export function codigoBemDireito(a: Pick<AtivoIR, "tipo" | "mercado">): CodigoDeclaracao | null {
  if (a.mercado === "exterior") {
    return { ficha: "Bens e Direitos", codigo: "07 · 99", descricao: "Fundos de Investimento no Exterior (Lei 14.754/2023)", divergente: false,
      nota: "ETF listado fora do Brasil; os rendimentos são apurados à parte, na declaração, a 15%." };
  }
  switch (a.tipo) {
    case "acao": return { ficha: "Bens e Direitos", codigo: "03 · 01", descricao: "Ações (inclusive as negociadas em bolsa)", divergente: false };
    case "fii": return { ficha: "Bens e Direitos", codigo: "07 · 03", descricao: "Fundos de Investimento Imobiliário (FII)", divergente: false };
    case "etf_acoes": case "etf_outros":
      return { ficha: "Bens e Direitos", codigo: "07 · 06", descricao: "ETF de renda variável (fundos de índice)", divergente: true,
        nota: "Há fontes que citam 07 · 09 (demais fundos de índice)." };
    case "etf_rf":
      return { ficha: "Bens e Direitos", codigo: "07 · 08", descricao: "ETF de renda fixa", divergente: true,
        nota: "Há fontes que citam 07 · 09 (demais fundos de índice)." };
    case "bdr":
      return { ficha: "Bens e Direitos", codigo: "03 · 01 ou 04 · 04", descricao: "BDR", divergente: true,
        nota: "As fontes divergem (também aparecem 04 · 04 e 04 · 49)." };
    default: return null; // Tesouro, CDB, LCI etc.: não incluídos; confirmar no programa
  }
}

export function codigoProvento(tipo: "dividendo" | "jcp" | "rendimento", exterior: boolean): CodigoDeclaracao {
  if (exterior) {
    return { ficha: "Apuração anual (Lei 14.754/2023)", codigo: "—", descricao: "Rendimentos do exterior não vão nas fichas de rendimentos comuns; são apurados à parte, a 15%", divergente: false };
  }
  if (tipo === "dividendo") return { ficha: "Rendimentos Isentos e Não Tributáveis", codigo: "09", descricao: "Lucros e dividendos recebidos", divergente: false };
  if (tipo === "jcp") return { ficha: "Tributação Exclusiva/Definitiva", codigo: "10", descricao: "Juros sobre capital próprio", divergente: false };
  return { ficha: "Rendimentos Isentos e Não Tributáveis", codigo: "26", descricao: "Outros (rendimentos de FII e fundos)", divergente: true,
    nota: "Confirme o código do seu tipo de rendimento no programa." };
}

// Confirmado em mais de uma fonte: o ganho de vendas de ações (swing trade, à vista) de até R$ 20 mil no mês é isento,
// mas precisa ser informado nesta ficha (a isenção não vale para ETFs, BDRs, FIIs nem day trade).
export const CODIGO_VENDA_ACOES_ISENTA: CodigoDeclaracao = {
  ficha: "Rendimentos Isentos e Não Tributáveis", codigo: "20",
  descricao: "Ganhos líquidos em operações no mercado à vista de ações negociadas em bolsa, até R$ 20 mil de vendas no mês", divergente: false,
};

export type MovRelatorio = MovIR & { provento_tipo?: "dividendo" | "jcp" | "rendimento" | null };

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const fimDoAno = (ano: number) => `${ano}-12-31`;

// ── Posição e custo de aquisição em uma data ───────────────────────────────────

export type PosicaoEm = {
  ativo_id: string; quantidade: number;
  custo: number;          // custo de aquisição das cotas em carteira, em R$ (exterior: PTAX de compra do dia da compra)
  custoMoeda: number;     // o mesmo custo na moeda do ativo (sem custos de corretagem)
};

export function posicoesEm(ativos: AtivoRelatorio[], movs: MovRelatorio[], ate: string): PosicaoEm[] {
  const porId = new Map(ativos.map((a) => [a.id, a]));
  const pos = new Map<string, PosicaoEm>();
  const ordenadas = movs.filter((m) => m.tipo !== "provento" && m.quantidade != null && m.data <= ate)
    .sort((a, b) => a.data.localeCompare(b.data) || (a.tipo === b.tipo ? 0 : a.tipo === "compra" ? -1 : 1));
  for (const m of ordenadas) {
    const a = porId.get(m.ativo_id);
    if (!a) continue;
    const p = pos.get(a.id) ?? { ativo_id: a.id, quantidade: 0, custo: 0, custoMoeda: 0 };
    const q = m.quantidade ?? 0;
    if (m.tipo === "compra") {
      const ext = a.mercado === "exterior";
      const cambio = m.ptax_compra ?? m.cambio_usado;
      p.quantidade += q;
      p.custo += ext && cambio != null ? m.valor_bruto * cambio + m.corretagem + m.emolumentos + m.outras_taxas : m.valor_liquido_brl;
      p.custoMoeda += m.valor_bruto;
    } else if (p.quantidade > 0) {
      const qv = Math.min(q, p.quantidade);
      const fracao = qv / p.quantidade;
      p.custo -= p.custo * fracao;
      p.custoMoeda -= p.custoMoeda * fracao;
      p.quantidade -= qv;
      if (p.quantidade < 1e-9) { p.quantidade = 0; p.custo = 0; p.custoMoeda = 0; }
    }
    pos.set(a.id, p);
  }
  return [...pos.values()];
}

// ── Relatório ──────────────────────────────────────────────────────────────────

export type BemDireito = {
  ativo_id: string; codigo: string; mercado: "brasil" | "exterior"; moeda: string; sede: string | null; gestora: string | null;
  quantidadeAnterior: number; custoAnterior: number;     // em 31/12 do ano anterior
  quantidade: number; custo: number; custoMoeda: number; // em 31/12 do ano
  discriminacao: string;                                 // texto sugerido para o campo "Discriminação"
  declarar: CodigoDeclaracao | null;                     // ficha e código sugeridos
};

export type LinhaProvento = {
  ativo_id: string; codigo: string; tipo: "dividendo" | "jcp" | "rendimento"; exterior: boolean; bruto: number; irRetido: number; liquido: number;
  declarar: CodigoDeclaracao;
};

export type RelatorioAnual = {
  ano: number;
  bens: BemDireito[];
  proventos: LinhaProvento[];
  totaisProventos: { dividendos: number; jcp: number; jcpIrRetido: number; rendimentos: number; exterior: number };
  mesesB3: MesB3[];                 // meses do ano com vendas na B3
  exterior: AnoExterior | null;
  fonte: MesFonte[];
  vendas: VendaApurada[];           // todas as vendas do ano (detalhe para o contador)
  totais: { resultadoB3: number; impostoB3: number; darfs: number; irRetidoFonte: number; resultadoExterior: number; impostoExterior: number };
  avisos: string[];
};

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 8 });

export function montarRelatorioAnual(p: {
  ano: number; ativos: AtivoRelatorio[]; movs: MovRelatorio[]; aliquotasTipo: Partial<Record<string, number>>;
}): RelatorioAnual {
  const { ano, ativos, movs, aliquotasTipo } = p;
  const anoStr = String(ano);
  const porId = new Map(ativos.map((a) => [a.id, a]));

  // Bens e direitos: posição em 31/12 do ano anterior e do ano
  const antes = new Map(posicoesEm(ativos, movs, fimDoAno(ano - 1)).map((x) => [x.ativo_id, x]));
  const depois = new Map(posicoesEm(ativos, movs, fimDoAno(ano)).map((x) => [x.ativo_id, x]));
  const bens: BemDireito[] = [];
  for (const a of ativos) {
    const x0 = antes.get(a.id), x1 = depois.get(a.id);
    if (!(x0?.quantidade) && !(x1?.quantidade)) continue;
    const q = x1?.quantidade ?? 0;
    const exterior = a.mercado === "exterior";
    bens.push({
      ativo_id: a.id, codigo: a.codigo, mercado: a.mercado, moeda: a.moeda, sede: a.sede, gestora: a.gestora,
      quantidadeAnterior: x0?.quantidade ?? 0, custoAnterior: r2(x0?.custo ?? 0),
      quantidade: q, custo: r2(x1?.custo ?? 0), custoMoeda: r2(x1?.custoMoeda ?? 0),
      declarar: codigoBemDireito(a),
      discriminacao: q > 0
        ? `${num(q)} cotas de ${a.codigo}${a.gestora ? `, gestora ${a.gestora}` : ""}${a.sede ? `, sede ${a.sede}` : ""}. Custo de aquisição: ${brl(x1?.custo ?? 0)}${exterior ? ` (US$/${a.moeda} ${num(r2(x1?.custoMoeda ?? 0))} convertidos pela PTAX de compra)` : ""}.`
        : `Posição zerada em 31/12/${ano}; em 31/12/${ano - 1} havia ${num(x0?.quantidade ?? 0)} cotas de ${a.codigo} (custo ${brl(x0?.custo ?? 0)}).`,
    });
  }

  // Proventos recebidos no ano
  const mapa = new Map<string, LinhaProvento>();
  for (const m of movs) {
    if (m.tipo !== "provento" || !m.data.startsWith(anoStr)) continue;
    const a = porId.get(m.ativo_id);
    if (!a) continue;
    const tipo = m.provento_tipo ?? "rendimento";
    const exterior = a.mercado === "exterior";
    const chave = `${a.id}|${tipo}`;
    const l = mapa.get(chave) ?? { ativo_id: a.id, codigo: a.codigo, tipo, exterior, bruto: 0, irRetido: 0, liquido: 0, declarar: codigoProvento(tipo, exterior) };
    // exterior: converte pela PTAX de venda do dia do recebimento
    const cambio = exterior ? m.ptax_venda ?? m.cambio_usado ?? 1 : 1;
    l.bruto += m.valor_bruto * cambio;
    l.irRetido += m.ir_retido;
    l.liquido = l.bruto - l.irRetido;
    mapa.set(chave, l);
  }
  const proventos = [...mapa.values()].map((l) => ({ ...l, bruto: r2(l.bruto), irRetido: r2(l.irRetido), liquido: r2(l.liquido) }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
  const somar = (f: (l: LinhaProvento) => boolean, k: "bruto" | "irRetido") => r2(proventos.filter(f).reduce((s, l) => s + l[k], 0));

  // Vendas, B3, exterior e renda fixa
  const { vendas: todas, avisos: avisosIR } = apurarVendas(ativos, movs, aliquotasTipo);
  const vendas = todas.filter((v) => v.data.startsWith(anoStr));
  const mesesB3 = apurarMesesB3(todas).filter((m) => m.competencia.startsWith(anoStr));
  const exterior = apurarAnosExterior(todas).find((x) => x.ano === ano) ?? null;
  const fonte = apurarFonte(todas).filter((m) => m.competencia.startsWith(anoStr));

  const avisos = [
    ...avisosIR.filter((a) => a.data.startsWith(anoStr)).map((a) => `${a.codigo} em ${a.data.split("-").reverse().join("/")}: ${a.texto}`),
  ];
  if (proventos.some((l) => l.exterior && l.bruto > 0)) {
    avisos.push("Há rendimentos recebidos do exterior: eles entram na apuração anual da Lei 14.754/2023, que este relatório ainda não soma ao resultado do exterior. Confirme com seu contador.");
  }
  if (vendas.some((v) => v.categoria === "outros")) {
    avisos.push(`Há vendas de ativos da categoria "${NOME_CATEGORIA.outros}" (por exemplo, criptoativos): as regras próprias deles não estão neste relatório.`);
  }

  return {
    ano, bens, proventos,
    totaisProventos: {
      dividendos: somar((l) => l.tipo === "dividendo" && !l.exterior, "bruto"),
      jcp: somar((l) => l.tipo === "jcp" && !l.exterior, "bruto"),
      jcpIrRetido: somar((l) => l.tipo === "jcp" && !l.exterior, "irRetido"),
      rendimentos: somar((l) => l.tipo === "rendimento" && !l.exterior, "bruto"),
      exterior: somar((l) => l.exterior, "bruto"),
    },
    mesesB3, exterior, fonte, vendas,
    totais: {
      resultadoB3: r2(mesesB3.reduce((s, m) => s + m.categorias.reduce((t, c) => t + c.resultado, 0), 0)),
      impostoB3: r2(mesesB3.reduce((s, m) => s + m.imposto, 0)),
      darfs: r2(mesesB3.reduce((s, m) => s + m.darf, 0)),
      irRetidoFonte: r2(fonte.reduce((s, m) => s + m.ir, 0)),
      resultadoExterior: exterior?.resultado ?? 0,
      impostoExterior: exterior?.imposto ?? 0,
    },
    avisos,
  };
}

// Anos com movimentações (para o seletor da tela), do mais recente para o mais antigo
export function anosComMovimentacao(movs: { data: string }[], anoAtual: number): number[] {
  const anos = new Set<number>([anoAtual]);
  for (const m of movs) anos.add(Number(m.data.slice(0, 4)));
  return [...anos].sort((a, b) => b - a);
}

// ── Exportação ─────────────────────────────────────────────────────────────────

const csvCel = (v: string | number | null | undefined) => {
  const t = v == null ? "" : String(v);
  return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const dec = (v: number) => v.toFixed(2).replace(".", ",");

// CSV com ponto e vírgula (abre direto no Excel em pt-BR); seções separadas por uma linha em branco
export function relatorioParaCsv(r: RelatorioAnual): string {
  const linhas: (string | number)[][] = [];
  const secao = (titulo: string, cab: string[], corpo: (string | number)[][]) => {
    if (linhas.length) linhas.push([]);
    linhas.push([titulo]);
    linhas.push(cab);
    linhas.push(...corpo);
  };
  linhas.push([`Relatório para a declaração — ano-calendário ${r.ano} (estimativa; confirme com seu contador)`]);
  secao("Bens e direitos em 31/12", ["Ativo", "Mercado", "Sede", "Gestora", `Quantidade 31/12/${r.ano - 1}`, `Custo 31/12/${r.ano - 1} (R$)`, `Quantidade 31/12/${r.ano}`, `Custo 31/12/${r.ano} (R$)`, "Custo na moeda", "Moeda", "Ficha", "Grupo · código (conferir)", "Discriminação"],
    r.bens.map((b) => [b.codigo, b.mercado === "exterior" ? "Exterior" : "Brasil", b.sede ?? "", b.gestora ?? "", b.quantidadeAnterior, dec(b.custoAnterior), b.quantidade, dec(b.custo), dec(b.custoMoeda), b.moeda, b.declarar?.ficha ?? "", b.declarar ? `${b.declarar.codigo}${b.declarar.divergente ? " (fontes divergem)" : ""}` : "confirmar no programa", b.discriminacao]));
  secao("Proventos recebidos", ["Ativo", "Tipo", "Origem", "Bruto (R$)", "IR retido (R$)", "Líquido (R$)", "Ficha", "Código"],
    r.proventos.map((l) => [l.codigo, l.tipo === "jcp" ? "JCP" : l.tipo === "dividendo" ? "Dividendo" : "Rendimento", l.exterior ? "Exterior" : "Brasil", dec(l.bruto), dec(l.irRetido), dec(l.liquido), l.declarar.ficha, l.declarar.codigo]));
  secao("Renda variável na B3 por mês", ["Mês", "Resultado (R$)", "Imposto (R$)", "Dedo-duro (R$)", "DARF (R$)", "Vencimento"],
    r.mesesB3.map((m) => [m.competencia.slice(0, 7), dec(m.categorias.reduce((s, c) => s + c.resultado, 0)), dec(m.imposto), dec(m.irrf), dec(m.darf), m.vencimento]));
  if (r.exterior) {
    secao("Exterior (Lei 14.754/2023)", ["Ano", "Resultado (R$)", "Prejuízo compensado (R$)", "Base (R$)", "Alíquota (%)", "Imposto (R$)", "Prejuízo a compensar (R$)"],
      [[r.exterior.ano, dec(r.exterior.resultado), dec(r.exterior.compensado), dec(r.exterior.base), r.exterior.aliquota, dec(r.exterior.imposto), dec(r.exterior.prejuizoFinal)]]);
  }
  secao("Renda fixa (retido na fonte)", ["Mês", "Ganho (R$)", "IR (R$)"], r.fonte.map((m) => [m.competencia.slice(0, 7), dec(m.ganho), dec(m.ir)]));
  secao("Vendas do ano", ["Data", "Ativo", "Categoria", "Valor da venda (R$)", "Receita líquida (R$)", "Custo (R$)", "Resultado (R$)"],
    r.vendas.map((v) => [v.data, v.codigo, NOME_CATEGORIA[v.categoria], dec(v.bruto), dec(v.receita), dec(v.custo), dec(v.ganho)]));
  return "﻿" + linhas.map((l) => l.map(csvCel).join(";")).join("\r\n");
}


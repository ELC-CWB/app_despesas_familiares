// Imposto de renda (docs/carteira/REGRAS.md §7), parte 1: ganho por venda, apuração mensal da B3
// (DARF), prejuízo a compensar e apuração anual do exterior. Funções puras; o app ESTIMA o imposto e
// não substitui um contador. As alíquotas são editáveis (por ativo em Configurações › Ativos; sem ela, vale o padrão do tipo).

import type { TipoAtivo } from "./constantes";

export type AtivoIR = {
  id: string; codigo: string; tipo: TipoAtivo; mercado: "brasil" | "exterior";
  aliquota_ir_pct: number | null;   // própria do ativo; null = a do tipo
};

export type MovIR = {
  id: string; data: string; tipo: "compra" | "venda" | "provento"; ativo_id: string;
  quantidade: number | null;
  valor_bruto: number;              // na moeda do ativo
  cambio_usado: number | null;
  ptax_compra: number | null; ptax_venda: number | null;
  corretagem: number; emolumentos: number; outras_taxas: number; // em R$
  valor_liquido_brl: number;
  ir_retido: number;
};

// Como cada ativo é tributado
export type CategoriaIR = "acao" | "rv" | "fii" | "fonte" | "exterior" | "outros";

export function categoriaIR(a: Pick<AtivoIR, "tipo" | "mercado">): CategoriaIR {
  if (a.mercado === "exterior") return "exterior";
  switch (a.tipo) {
    case "acao": return "acao";
    case "etf_acoes": case "etf_outros": case "bdr": return "rv";
    case "fii": return "fii";
    case "etf_rf": case "tesouro": case "cdb": case "lci": case "debenture": case "fundo": return "fonte";
    default: return "outros"; // cripto: regras próprias, fora da estimativa
  }
}

export const NOME_CATEGORIA: Record<CategoriaIR, string> = {
  acao: "Ações", rv: "ETFs e BDRs na B3", fii: "Fundos imobiliários", fonte: "Renda fixa (retido na fonte)",
  exterior: "Exterior", outros: "Outros",
};

export const ISENCAO_ACOES_MENSAL = 20000;   // vendas de ações até R$ 20 mil no mês
export const DEDO_DURO_PCT = 0.005;          // IRRF sobre o valor de venda (operações comuns)
export const DARF_MINIMO = 10;               // abaixo disso acumula para o mês seguinte

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

// ── Ganho por venda ────────────────────────────────────────────────────────────

export type VendaApurada = {
  mov_id: string; data: string; ativo_id: string; codigo: string; categoria: CategoriaIR;
  bruto: number;        // valor da venda em R$ (base do dedo-duro e do limite de R$ 20 mil)
  receita: number;      // bruto menos os custos da venda
  custo: number;        // custo de aquisição das cotas vendidas
  ganho: number;        // receita − custo (pode ser negativo)
  aliquota: number;     // % aplicável ao ativo
  ir_retido: number;    // informado na operação
  aviso: string | null;
};

type Posicao = { quantidade: number; custo: number };

// Percorre as operações em ordem cronológica mantendo o preço médio em R$ de cada ativo.
//  • Brasil: custo = valor líquido pago na compra (já inclui corretagem e emolumentos).
//  • Exterior (Lei 14.754/2023): compra convertida pela PTAX de compra do dia da compra e venda pela
//    PTAX de venda do dia da venda; corretagem e taxas entram no custo/venda; spread e IOF de câmbio
//    NÃO são abatidos (estimativa conservadora). Falta de PTAX: usa o câmbio da operação e avisa.
export type AvisoIR = { data: string; codigo: string; texto: string };

export function apurarVendas(
  ativos: AtivoIR[], movs: MovIR[], aliquotasTipo: Partial<Record<string, number>>,
): { vendas: VendaApurada[]; avisos: AvisoIR[] } {
  const porId = new Map(ativos.map((a) => [a.id, a]));
  const pos = new Map<string, Posicao>();
  const vendas: VendaApurada[] = [];
  const avisos: AvisoIR[] = [];
  const ordenadas = [...movs].filter((m) => m.tipo !== "provento" && m.quantidade != null)
    .sort((a, b) => a.data.localeCompare(b.data) || (a.tipo === b.tipo ? 0 : a.tipo === "compra" ? -1 : 1));

  for (const m of ordenadas) {
    const a = porId.get(m.ativo_id);
    if (!a) continue;
    const categoria = categoriaIR(a);
    const ext = categoria === "exterior";
    const p = pos.get(a.id) ?? { quantidade: 0, custo: 0 };
    const q = m.quantidade ?? 0;
    let aviso: string | null = null;

    if (m.tipo === "compra") {
      let custo = m.valor_liquido_brl;
      if (ext) {
        const cambio = m.ptax_compra ?? m.cambio_usado;
        if (m.ptax_compra == null) aviso = "Sem PTAX do dia da compra; usado o câmbio da operação.";
        if (cambio != null) custo = m.valor_bruto * cambio + m.corretagem + m.emolumentos + m.outras_taxas;
      }
      p.quantidade += q;
      p.custo += custo;
      pos.set(a.id, p);
      if (aviso) avisos.push({ data: m.data, codigo: a.codigo, texto: aviso });
      continue;
    }

    const qv = Math.min(q, p.quantidade);
    const pm = p.quantidade > 0 ? p.custo / p.quantidade : 0;
    const custo = pm * qv;
    p.quantidade -= qv;
    p.custo -= custo;
    if (p.quantidade < 1e-9) { p.quantidade = 0; p.custo = 0; }
    pos.set(a.id, p);

    let bruto = m.valor_bruto;
    if (ext) {
      const cambio = m.ptax_venda ?? m.cambio_usado ?? 0;
      if (m.ptax_venda == null) aviso = "Sem PTAX do dia da venda; usado o câmbio da operação.";
      bruto = m.valor_bruto * cambio;
    }
    const receita = bruto - m.corretagem - m.emolumentos - m.outras_taxas;
    const aliquota = a.aliquota_ir_pct ?? aliquotasTipo[ext ? "exterior" : a.tipo] ?? 15;
    vendas.push({
      mov_id: m.id, data: m.data, ativo_id: a.id, codigo: a.codigo, categoria,
      bruto: r2(bruto), receita: r2(receita), custo: r2(custo), ganho: r2(receita - custo),
      aliquota, ir_retido: m.ir_retido, aviso,
    });
    if (aviso) avisos.push({ data: m.data, codigo: a.codigo, texto: aviso });
  }
  return { vendas, avisos };
}

// ── Vencimento do DARF ─────────────────────────────────────────────────────────

const FERIADOS_FIXOS = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25"];

const iso = (d: Date) => d.toISOString().slice(0, 10);

// Último dia útil do mês seguinte à competência (fins de semana e feriados nacionais fixos; os móveis,
// como Carnaval e Corpus Christi, não entram: confira o calendário da Receita).
export function vencimentoDarf(competencia: string): string {
  const [y, m] = competencia.split("-").map(Number);
  const d = new Date(Date.UTC(y, m + 1, 0)); // último dia do mês seguinte
  for (;;) {
    const dia = d.getUTCDay();
    const mmdd = iso(d).slice(5);
    const feriado = FERIADOS_FIXOS.includes(mmdd) || (d.getUTCFullYear() >= 2024 && mmdd === "11-20");
    if (dia !== 0 && dia !== 6 && !feriado) return iso(d);
    d.setUTCDate(d.getUTCDate() - 1);
  }
}

// ── Apuração mensal da B3 ──────────────────────────────────────────────────────

export type LinhaCategoriaMes = {
  categoria: CategoriaIR;
  vendas: number;           // soma das vendas brutas
  resultado: number;        // ganhos − perdas do mês
  isento: boolean;          // ações: vendas ≤ R$ 20 mil com lucro
  prejuizoAnterior: number; // saldo a compensar antes do mês
  compensado: number;
  prejuizoFinal: number;
  base: number;
  aliquota: number;
  imposto: number;
};

export type MesB3 = {
  competencia: string;      // AAAA-MM-01
  categorias: LinhaCategoriaMes[];
  imposto: number;          // soma dos impostos das categorias
  irrf: number;             // dedo-duro do mês
  acumuladoAnterior: number;// DARF de meses anteriores abaixo de R$ 10, somado a este
  darf: number;             // valor a pagar (0 se não há imposto ou se ficou abaixo do mínimo)
  abaixoMinimo: boolean;    // ficou abaixo de R$ 10 e foi para o mês seguinte
  vencimento: string;
};

const CATEGORIAS_B3: CategoriaIR[] = ["acao", "rv", "fii"];

export function apurarMesesB3(vendas: VendaApurada[]): MesB3[] {
  const reais = vendas.filter((v) => CATEGORIAS_B3.includes(v.categoria));
  const meses = [...new Set(reais.map((v) => `${v.data.slice(0, 7)}-01`))].sort();
  const prejuizo: Record<string, number> = {};
  let irrfSobra = 0;
  let acumulado = 0;
  const saida: MesB3[] = [];

  for (const competencia of meses) {
    const doMes = reais.filter((v) => v.data.startsWith(competencia.slice(0, 7)));
    const categorias: LinhaCategoriaMes[] = [];
    for (const categoria of CATEGORIAS_B3) {
      const vs = doMes.filter((v) => v.categoria === categoria);
      if (!vs.length) continue;
      const vendasBrutas = vs.reduce((s, v) => s + v.bruto, 0);
      const resultado = vs.reduce((s, v) => s + v.ganho, 0);
      const anterior = prejuizo[categoria] ?? 0;
      const isento = categoria === "acao" && vendasBrutas <= ISENCAO_ACOES_MENSAL && resultado > 0;
      let compensado = 0, base = 0, final = anterior;
      if (resultado < 0) final = anterior - resultado;
      else if (!isento) {
        compensado = Math.min(anterior, resultado);
        base = resultado - compensado;
        final = anterior - compensado;
      }
      prejuizo[categoria] = final;
      // alíquota ponderada pelos ganhos positivos (quando os ativos têm alíquotas próprias diferentes)
      const pos = vs.filter((v) => v.ganho > 0);
      const somaPos = pos.reduce((s, v) => s + v.ganho, 0);
      const aliquota = somaPos > 0 ? pos.reduce((s, v) => s + v.aliquota * v.ganho, 0) / somaPos : vs[0].aliquota;
      categorias.push({
        categoria, vendas: r2(vendasBrutas), resultado: r2(resultado), isento, prejuizoAnterior: r2(anterior),
        compensado: r2(compensado), prejuizoFinal: r2(final), base: r2(base), aliquota, imposto: r2((base * aliquota) / 100),
      });
    }
    const imposto = categorias.reduce((s, c) => s + c.imposto, 0);
    // dedo-duro: o informado na operação ou, se vazio, 0,005% do valor vendido (ações e ETFs; FII não)
    const irrf = doMes.filter((v) => v.categoria !== "fii")
      .reduce((s, v) => s + (v.ir_retido > 0 ? v.ir_retido : (v.bruto * DEDO_DURO_PCT) / 100), 0);
    const credito = irrf + irrfSobra;
    const devido = Math.max(0, imposto - credito);
    irrfSobra = Math.max(0, credito - imposto);
    const total = devido + acumulado;
    const abaixoMinimo = total > 0 && total < DARF_MINIMO;
    saida.push({
      competencia, categorias, imposto: r2(imposto), irrf: r2(irrf), acumuladoAnterior: r2(acumulado),
      darf: abaixoMinimo ? 0 : r2(total), abaixoMinimo, vencimento: vencimentoDarf(competencia),
    });
    acumulado = abaixoMinimo ? total : 0;
  }
  return saida;
}

// ── Exterior: apuração anual (Lei 14.754/2023) ─────────────────────────────────

export type AnoExterior = {
  ano: number; resultado: number; prejuizoAnterior: number; compensado: number; prejuizoFinal: number;
  base: number; aliquota: number; imposto: number;
};

export function apurarAnosExterior(vendas: VendaApurada[]): AnoExterior[] {
  const ext = vendas.filter((v) => v.categoria === "exterior");
  const anos = [...new Set(ext.map((v) => Number(v.data.slice(0, 4))))].sort((a, b) => a - b);
  let prejuizo = 0;
  return anos.map((ano) => {
    const vs = ext.filter((v) => v.data.startsWith(String(ano)));
    const resultado = vs.reduce((s, v) => s + v.ganho, 0);
    const anterior = prejuizo;
    let compensado = 0, base = 0;
    if (resultado < 0) prejuizo += -resultado;
    else {
      compensado = Math.min(prejuizo, resultado);
      base = resultado - compensado;
      prejuizo -= compensado;
    }
    const pos = vs.filter((v) => v.ganho > 0);
    const somaPos = pos.reduce((s, v) => s + v.ganho, 0);
    const aliquota = somaPos > 0 ? pos.reduce((s, v) => s + v.aliquota * v.ganho, 0) / somaPos : vs[0].aliquota;
    return {
      ano, resultado: r2(resultado), prejuizoAnterior: r2(anterior), compensado: r2(compensado), prejuizoFinal: r2(prejuizo),
      base: r2(base), aliquota, imposto: r2((base * aliquota) / 100),
    };
  });
}

// ── Renda fixa: retido na fonte ────────────────────────────────────────────────

export type MesFonte = { competencia: string; ganho: number; ir: number };

export function apurarFonte(vendas: VendaApurada[]): MesFonte[] {
  const vs = vendas.filter((v) => v.categoria === "fonte");
  const meses = [...new Set(vs.map((v) => `${v.data.slice(0, 7)}-01`))].sort();
  return meses.map((competencia) => {
    const doMes = vs.filter((v) => v.data.startsWith(competencia.slice(0, 7)));
    return {
      competencia,
      ganho: r2(doMes.reduce((s, v) => s + v.ganho, 0)),
      ir: r2(doMes.reduce((s, v) => s + (v.ir_retido > 0 ? v.ir_retido : (Math.max(0, v.ganho) * v.aliquota) / 100), 0)),
    };
  });
}

// ── Situação do DARF ───────────────────────────────────────────────────────────

export type SituacaoDarf = "pago" | "vencido" | "a_vencer" | "sem_imposto";

export function situacaoDarf(mes: MesB3, pagos: Set<string>, hoje: string): SituacaoDarf {
  if (mes.darf <= 0) return "sem_imposto";
  if (pagos.has(mes.competencia)) return "pago";
  return mes.vencimento < hoje ? "vencido" : "a_vencer";
}

// Avisos para a Visão geral: DARFs com imposto, ainda não marcados como pagos, vencidos ou vencendo em até 10 dias
export function darfsPendentes(meses: MesB3[], pagos: Set<string>, hoje: string): MesB3[] {
  const limite = new Date(`${hoje}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + 10);
  const ate = iso(limite);
  return meses.filter((m) => situacaoDarf(m, pagos, hoje) !== "sem_imposto" && !pagos.has(m.competencia) && m.vencimento <= ate);
}

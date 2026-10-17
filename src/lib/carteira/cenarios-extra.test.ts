import { describe, expect, it } from "vitest";
import { apurarMesesB3, apurarVendas, type AtivoIR, type MovIR } from "@/lib/carteira/ir";
import { montarRelatorioAnual, type AtivoRelatorio, type MovRelatorio } from "@/lib/carteira/ir-relatorio";
import { avaliarGuardrails, corrigirPorAniversarios, escolherAtivoSaque } from "@/lib/carteira/usufruto";
import { projetar, projetarTunel, type Premissas } from "@/lib/carteira/plano";
import { indiceCarteira } from "@/lib/carteira/historico";

const base = { cambio_usado: null, ptax_compra: null, ptax_venda: null, corretagem: 0, emolumentos: 0, outras_taxas: 0, ir_retido: 0 };
let n = 0;
const compra = (ativo_id: string, data: string, q: number, liq: number, e: Partial<MovIR> = {}): MovIR => ({ ...base, id: `c${++n}`, data, tipo: "compra", ativo_id, quantidade: q, valor_bruto: liq, valor_liquido_brl: liq, ...e });
const venda = (ativo_id: string, data: string, q: number, bruto: number, e: Partial<MovIR> = {}): MovIR => ({ ...base, id: `v${++n}`, data, tipo: "venda", ativo_id, quantidade: q, valor_bruto: bruto, valor_liquido_brl: bruto, ...e });
const A: AtivoIR[] = [
  { id: "etf", codigo: "QLBR11", tipo: "etf_acoes", mercado: "brasil", aliquota_ir_pct: null },
  { id: "acao", codigo: "ABCD3", tipo: "acao", mercado: "brasil", aliquota_ir_pct: null },
];
const aliq = { etf_acoes: 15, acao: 15 };

describe("IR: cenários de borda", () => {
  it("venda e compra no mesmo dia: a compra entra antes (não deixa a venda sem posição)", () => {
    const { vendas } = apurarVendas(A, [venda("etf", "2026-03-10", 10, 1500), compra("etf", "2026-03-10", 10, 1000)], aliq);
    expect(vendas).toHaveLength(1);
    expect(vendas[0].custo).toBeCloseTo(1000, 6);
  });
  it("vender mais do que tem não gera custo negativo nem NaN", () => {
    const { vendas } = apurarVendas(A, [compra("etf", "2026-01-10", 5, 500), venda("etf", "2026-02-10", 10, 2000)], aliq);
    expect(Number.isFinite(vendas[0].ganho)).toBe(true);
    expect(vendas[0].custo).toBeCloseTo(500, 6);
  });
  it("posição zerada e recomprada recomeça o preço médio", () => {
    const { vendas } = apurarVendas(A, [
      compra("etf", "2026-01-10", 10, 1000), venda("etf", "2026-02-10", 10, 1200),
      compra("etf", "2026-03-10", 10, 2000), venda("etf", "2026-04-10", 10, 2500),
    ], aliq);
    expect(vendas[1].custo).toBeCloseTo(2000, 6);
  });
  it("ações: exatamente R$ 20.000 em vendas ainda é isento; R$ 20.000,01 não", () => {
    const m = (valor: number) => apurarMesesB3(apurarVendas(A, [compra("acao", "2026-01-05", 1000, 10000), venda("acao", "2026-02-10", 500, valor)], aliq).vendas)[0];
    expect(m(20000).categorias[0].isento).toBe(true);
    expect(m(20000.01).categorias[0].isento).toBe(false);
  });
  it("sem nenhuma venda não há meses nem DARF", () => {
    expect(apurarMesesB3(apurarVendas(A, [compra("etf", "2026-01-10", 10, 1000)], aliq).vendas)).toEqual([]);
  });
  it("relatório de um ano sem movimentações não quebra", () => {
    const at: AtivoRelatorio[] = A.map((a) => ({ ...a, moeda: "BRL", sede: null, gestora: null }));
    const r = montarRelatorioAnual({ ano: 2026, ativos: at, movs: [] as MovRelatorio[], aliquotasTipo: aliq });
    expect(r.bens).toEqual([]);
    expect(r.totais.impostoB3).toBe(0);
  });
});

describe("Usufruto e plano: cenários de borda", () => {
  it("correção por IPCA com série vazia não altera o valor", () => {
    expect(corrigirPorAniversarios(1000, "2026-01-01", "2026-01-01", "2030-01-01", [])).toBe(1000);
  });
  it("sem ativo com saldo, não há ativo a vender", () => {
    expect(escolherAtivoSaque([{ id: "a", codigo: "A", mercado: "brasil", alvo_pct: 100, banda_pp: 5 }], { a: 0 }, 100, null).ativo).toBeNull();
  });
  it("guardrails sem retiradas não sugerem nada", () => {
    expect(avaliarGuardrails({
      regras: { protecao_on: true, queda_pct: 20, corte_pct: 10, aumento_on: true, gatilho_pct: 3, aumento_pct: 10 },
      hoje: "2026-06-01", inicio: "2026-01-01", retiradas: [], ipca: [], patrimonio: 1, pico: 100, pontos: [],
    })).toBeNull();
  });
  const p: Premissas = { ano_inicio: 2026, patrimonio_inicial: 0, aporte_mensal: 0, anos_aporte: 0, perpetuo: false, anos_usufruto: 1, retirada_pct: 5, rent_pess_pct: 3, rent_otim_pct: 6 };
  it("plano sem patrimônio e sem aporte não gera NaN", () => {
    const t = projetarTunel(p);
    expect(t.pess.valores.every(Number.isFinite)).toBe(true);
    expect(projetar(p, 3).saqueAnual).toBe(0);
  });
  it("aporte zero e anos de aporte zero começam direto no usufruto", () => {
    const r = projetar({ ...p, patrimonio_inicial: 1000 }, 3);
    expect(r.saqueAnual).toBeCloseTo(50, 6);
  });
});

describe("Histórico: cenários de borda", () => {
  it("uma única data não gera índice nem erro", () => {
    expect(indiceCarteira(["2026-01-02"], [{ data: "2026-01-02", tipo: "compra", ativo_id: "A", quantidade: 1, valorBRL: 0 }], { A: [10] }).indice).toEqual([null]);
  });
  it("preço zero ou ausente não gera divisão por zero", () => {
    const r = indiceCarteira(["2026-01-02", "2026-01-05"], [{ data: "2026-01-02", tipo: "compra", ativo_id: "A", quantidade: 1, valorBRL: 0 }], { A: [0, 5] });
    expect(r.indice.every((v) => v == null || Number.isFinite(v))).toBe(true);
  });
});

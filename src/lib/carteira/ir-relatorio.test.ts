import { describe, expect, it } from "vitest";
import { anosComMovimentacao, CODIGO_VENDA_ACOES_ISENTA, codigoBemDireito, codigoProvento, montarRelatorioAnual, posicoesEm, relatorioParaCsv, type AtivoRelatorio, type MovRelatorio } from "@/lib/carteira/ir-relatorio";

const ativos: AtivoRelatorio[] = [
  { id: "etf", codigo: "QLBR11", tipo: "etf_acoes", mercado: "brasil", aliquota_ir_pct: null, moeda: "BRL", sede: "Brasil", gestora: "Investo" },
  { id: "valu", codigo: "VALU", tipo: "etf_acoes", mercado: "exterior", aliquota_ir_pct: null, moeda: "USD", sede: "Irlanda", gestora: "Vanguard" },
  { id: "lfts", codigo: "LFTS11", tipo: "etf_rf", mercado: "brasil", aliquota_ir_pct: 25, moeda: "BRL", sede: "Brasil", gestora: null },
];
const aliq = { etf_acoes: 15, exterior: 15, etf_rf: 15 };

let n = 0;
const base = { cambio_usado: null, ptax_compra: null, ptax_venda: null, corretagem: 0, emolumentos: 0, outras_taxas: 0, ir_retido: 0 };
const compra = (ativo_id: string, data: string, quantidade: number, liquido: number, extra: Partial<MovRelatorio> = {}): MovRelatorio => ({
  ...base, id: `m${++n}`, data, tipo: "compra", ativo_id, quantidade, valor_bruto: liquido, valor_liquido_brl: liquido, ...extra,
});
const venda = (ativo_id: string, data: string, quantidade: number, bruto: number, extra: Partial<MovRelatorio> = {}): MovRelatorio => ({
  ...base, id: `m${++n}`, data, tipo: "venda", ativo_id, quantidade, valor_bruto: bruto, valor_liquido_brl: bruto, ...extra,
});
const provento = (ativo_id: string, data: string, bruto: number, tipo: "dividendo" | "jcp" | "rendimento", extra: Partial<MovRelatorio> = {}): MovRelatorio => ({
  ...base, id: `m${++n}`, data, tipo: "provento", ativo_id, quantidade: null, valor_bruto: bruto, valor_liquido_brl: bruto, provento_tipo: tipo, ...extra,
});

describe("posição e custo em 31/12", () => {
  const movs = [
    compra("etf", "2025-03-10", 100, 10000),
    compra("etf", "2025-11-10", 100, 12000),
    venda("etf", "2026-02-10", 50, 6000),
  ];
  it("custo = custo das compras; a venda baixa pelo preço médio", () => {
    const [p25] = posicoesEm(ativos, movs, "2025-12-31");
    expect(p25.quantidade).toBe(200);
    expect(p25.custo).toBeCloseTo(22000, 6);
    const [p26] = posicoesEm(ativos, movs, "2026-12-31");
    expect(p26.quantidade).toBe(150);
    expect(p26.custo).toBeCloseTo(22000 * 0.75, 6);
  });
  it("não conta operações depois da data", () => {
    expect(posicoesEm(ativos, movs, "2025-06-30")[0].quantidade).toBe(100);
  });
  it("exterior: custo em R$ pela PTAX de compra do dia; custo na moeda sem conversão", () => {
    const [p] = posicoesEm(ativos, [compra("valu", "2025-03-01", 10, 5100, { valor_bruto: 1000, cambio_usado: 5.1, ptax_compra: 5.0, corretagem: 10 })], "2025-12-31");
    expect(p.custo).toBeCloseTo(5010, 6);
    expect(p.custoMoeda).toBeCloseTo(1000, 6);
  });
});

describe("relatório anual", () => {
  const movs: MovRelatorio[] = [
    compra("etf", "2025-03-10", 100, 10000),
    compra("valu", "2025-03-01", 10, 5100, { valor_bruto: 1000, cambio_usado: 5.1, ptax_compra: 5.0 }),
    compra("lfts", "2025-04-01", 10, 1000),
    venda("etf", "2026-02-10", 20, 3000),                        // ganho 1.000 (PM 100)
    venda("valu", "2026-06-10", 5, 700, { ptax_venda: 5.5 }),    // receita 3.850, custo 2.500
    venda("lfts", "2026-07-02", 10, 1100),                       // ganho 100, IR 25%
    provento("etf", "2026-05-05", 200, "dividendo"),
    provento("etf", "2026-06-05", 100, "jcp", { ir_retido: 15 }),
    provento("valu", "2026-08-05", 20, "dividendo", { valor_bruto: 20, ptax_venda: 5.0 }),
    compra("etf", "2027-01-05", 1, 99999),                       // fora do ano
  ];
  const r = montarRelatorioAnual({ ano: 2026, ativos, movs, aliquotasTipo: aliq });

  it("bens e direitos: posição em 31/12/2025 e 31/12/2026, com a discriminação", () => {
    const etf = r.bens.find((b) => b.codigo === "QLBR11")!;
    expect(etf.quantidadeAnterior).toBe(100);
    expect(etf.custoAnterior).toBe(10000);
    expect(etf.quantidade).toBe(80);
    expect(etf.custo).toBeCloseTo(8000, 6);
    expect(etf.discriminacao).toMatch(/80 cotas de QLBR11/);
    expect(etf.discriminacao).toMatch(/Investo/);
    const valu = r.bens.find((b) => b.codigo === "VALU")!;
    expect(valu.quantidade).toBe(5);
    expect(valu.custo).toBeCloseTo(2500, 6);
    expect(valu.discriminacao).toMatch(/Irlanda/);
  });

  it("proventos: dividendo isento, JCP com IR retido e exterior à parte", () => {
    expect(r.totaisProventos.dividendos).toBe(200);
    expect(r.totaisProventos.jcp).toBe(100);
    expect(r.totaisProventos.jcpIrRetido).toBe(15);
    expect(r.totaisProventos.exterior).toBe(100); // 20 USD × PTAX 5,00
    expect(r.avisos.some((a) => /exterior/.test(a))).toBe(true);
  });

  it("ganhos: B3 por mês, exterior no ano e renda fixa retida", () => {
    expect(r.mesesB3).toHaveLength(1);
    expect(r.totais.resultadoB3).toBeCloseTo(1000, 6);
    expect(r.totais.impostoB3).toBeCloseTo(150, 6);
    expect(r.exterior?.resultado).toBeCloseTo(1350, 6);
    expect(r.totais.impostoExterior).toBeCloseTo(202.5, 6);
    expect(r.totais.irRetidoFonte).toBeCloseTo(25, 6);
  });

  it("lista todas as vendas do ano e ignora anos diferentes", () => {
    expect(r.vendas).toHaveLength(3);
    const r25 = montarRelatorioAnual({ ano: 2025, ativos, movs, aliquotasTipo: aliq });
    expect(r25.vendas).toHaveLength(0);
    expect(r25.bens.find((b) => b.codigo === "QLBR11")?.quantidade).toBe(100);
  });

  it("anos para o seletor: o atual e os das movimentações, do mais recente ao mais antigo", () => {
    expect(anosComMovimentacao(movs, 2026)).toEqual([2027, 2026, 2025]);
  });

  it("CSV: separado por ponto e vírgula, com BOM, seções e valores em pt-BR", () => {
    const csv = relatorioParaCsv(r);
    expect(csv.startsWith("\ufeff")).toBe(true);
    expect(csv).toMatch(/Bens e direitos em 31\/12/);
    expect(csv).toMatch(/QLBR11;Brasil;Brasil;Investo;100;10000,00;80;8000,00/);
    expect(csv).toMatch(/Vendas do ano/);
  });
});

describe("onde declarar (ficha e código)", () => {
  it("bens e direitos por tipo de ativo", () => {
    expect(codigoBemDireito({ tipo: "acao", mercado: "brasil" })).toMatchObject({ codigo: "03 · 01", divergente: false });
    expect(codigoBemDireito({ tipo: "fii", mercado: "brasil" })).toMatchObject({ codigo: "07 · 03", divergente: false });
    expect(codigoBemDireito({ tipo: "etf_acoes", mercado: "exterior" })).toMatchObject({ codigo: "07 · 99" });
  });
  it("marca como divergente o que as fontes não confirmam e não inventa código para o resto", () => {
    expect(codigoBemDireito({ tipo: "etf_acoes", mercado: "brasil" })?.divergente).toBe(true);
    expect(codigoBemDireito({ tipo: "etf_rf", mercado: "brasil" })?.divergente).toBe(true);
    expect(codigoBemDireito({ tipo: "bdr", mercado: "brasil" })?.divergente).toBe(true);
    expect(codigoBemDireito({ tipo: "tesouro", mercado: "brasil" })).toBeNull();
    expect(codigoBemDireito({ tipo: "cdb", mercado: "brasil" })).toBeNull();
  });
  it("proventos: dividendo isento, JCP exclusiva/definitiva, exterior fora das fichas", () => {
    expect(codigoProvento("dividendo", false)).toMatchObject({ codigo: "09", ficha: "Rendimentos Isentos e Não Tributáveis" });
    expect(codigoProvento("jcp", false)).toMatchObject({ codigo: "10", ficha: "Tributação Exclusiva/Definitiva" });
    expect(codigoProvento("dividendo", true).codigo).toBe("—");
  });
  it("o relatório e o CSV trazem a ficha e o código", () => {
    const r = montarRelatorioAnual({
      ano: 2026, ativos,
      movs: [compra("etf", "2025-03-10", 100, 10000), provento("etf", "2026-05-05", 200, "dividendo")],
      aliquotasTipo: aliq,
    });
    expect(r.bens[0].declarar?.codigo).toBe("07 · 06");
    expect(r.proventos[0].declarar.codigo).toBe("09");
    const csv = relatorioParaCsv(r);
    expect(csv).toMatch(/07 · 06 \(fontes divergem\)/);
    expect(csv).toMatch(/Rendimentos Isentos e Não Tributáveis;09/);
  });
});

describe("isenção das vendas de ações até R$ 20 mil", () => {
  it("o código é o 20 de Rendimentos Isentos e não é marcado como divergente", () => {
    expect(CODIGO_VENDA_ACOES_ISENTA).toMatchObject({ codigo: "20", ficha: "Rendimentos Isentos e Não Tributáveis", divergente: false });
  });
});

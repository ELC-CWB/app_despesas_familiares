import { describe, expect, it } from "vitest";
import {
  apurarAnosExterior, apurarFonte, apurarMesesB3, apurarVendas, categoriaIR, darfsPendentes, situacaoDarf, vencimentoDarf,
  type AtivoIR, type MovIR,
} from "@/lib/carteira/ir";

const ativos: AtivoIR[] = [
  { id: "etf", codigo: "QLBR11", tipo: "etf_acoes", mercado: "brasil", aliquota_ir_pct: null },
  { id: "acao", codigo: "ABCD3", tipo: "acao", mercado: "brasil", aliquota_ir_pct: null },
  { id: "fii", codigo: "XPTO11", tipo: "fii", mercado: "brasil", aliquota_ir_pct: null },
  { id: "lfts", codigo: "LFTS11", tipo: "etf_rf", mercado: "brasil", aliquota_ir_pct: 25 },
  { id: "b5", codigo: "B5MB11", tipo: "etf_rf", mercado: "brasil", aliquota_ir_pct: null },
  { id: "valu", codigo: "VALU", tipo: "etf_acoes", mercado: "exterior", aliquota_ir_pct: null },
];
const aliq = { etf_acoes: 15, acao: 15, fii: 20, etf_rf: 15, exterior: 15 };

let n = 0;
const compra = (ativo_id: string, data: string, quantidade: number, liquido: number, extra: Partial<MovIR> = {}): MovIR => ({
  id: `m${++n}`, data, tipo: "compra", ativo_id, quantidade, valor_bruto: liquido, cambio_usado: null, ptax_compra: null, ptax_venda: null,
  corretagem: 0, emolumentos: 0, outras_taxas: 0, valor_liquido_brl: liquido, ir_retido: 0, ...extra,
});
const venda = (ativo_id: string, data: string, quantidade: number, bruto: number, extra: Partial<MovIR> = {}): MovIR => ({
  id: `m${++n}`, data, tipo: "venda", ativo_id, quantidade, valor_bruto: bruto, cambio_usado: null, ptax_compra: null, ptax_venda: null,
  corretagem: 0, emolumentos: 0, outras_taxas: 0, valor_liquido_brl: bruto, ir_retido: 0, ...extra,
});

describe("categoria de tributação", () => {
  it("separa B3, renda fixa retida e exterior", () => {
    expect(categoriaIR({ tipo: "etf_acoes", mercado: "brasil" })).toBe("rv");
    expect(categoriaIR({ tipo: "etf_outros", mercado: "brasil" })).toBe("rv");
    expect(categoriaIR({ tipo: "acao", mercado: "brasil" })).toBe("acao");
    expect(categoriaIR({ tipo: "fii", mercado: "brasil" })).toBe("fii");
    expect(categoriaIR({ tipo: "etf_rf", mercado: "brasil" })).toBe("fonte");
    expect(categoriaIR({ tipo: "etf_acoes", mercado: "exterior" })).toBe("exterior");
    expect(categoriaIR({ tipo: "cripto", mercado: "brasil" })).toBe("outros");
  });
});

describe("ganho por venda (preço médio)", () => {
  it("custo = preço médio ponderado das compras; venda parcial mantém o preço médio", () => {
    const { vendas } = apurarVendas(ativos, [
      compra("etf", "2026-01-10", 10, 1000), compra("etf", "2026-02-10", 10, 1400), // PM = 120
      venda("etf", "2026-03-10", 5, 800, { corretagem: 2, emolumentos: 0.5 }),
    ], aliq);
    expect(vendas).toHaveLength(1);
    expect(vendas[0].custo).toBeCloseTo(600, 6);
    expect(vendas[0].receita).toBeCloseTo(797.5, 6);
    expect(vendas[0].ganho).toBeCloseTo(197.5, 6);
    // a segunda venda continua com PM 120
    const r = apurarVendas(ativos, [
      compra("etf", "2026-01-10", 10, 1000), compra("etf", "2026-02-10", 10, 1400),
      venda("etf", "2026-03-10", 5, 800), venda("etf", "2026-04-10", 5, 500),
    ], aliq);
    expect(r.vendas[1].custo).toBeCloseTo(600, 6);
    expect(r.vendas[1].ganho).toBeCloseTo(-100, 6);
  });

  it("alíquota própria do ativo vence a do tipo", () => {
    const { vendas } = apurarVendas(ativos, [compra("lfts", "2026-01-02", 10, 1000), venda("lfts", "2026-02-02", 10, 1100)], aliq);
    expect(vendas[0].aliquota).toBe(25);
    const b5 = apurarVendas(ativos, [compra("b5", "2026-01-02", 10, 1000), venda("b5", "2026-02-02", 10, 1100)], aliq);
    expect(b5.vendas[0].aliquota).toBe(15);
  });

  it("exterior: custo pela PTAX de compra do dia da compra e venda pela PTAX de venda do dia da venda", () => {
    const { vendas, avisos } = apurarVendas(ativos, [
      compra("valu", "2026-01-10", 10, 5100, { valor_bruto: 1000, cambio_usado: 5.1, ptax_compra: 5.0, corretagem: 10 }),
      venda("valu", "2026-06-10", 10, 1200, { cambio_usado: 5.4, ptax_venda: 5.5, corretagem: 12 }),
    ], aliq);
    expect(avisos).toHaveLength(0);
    expect(vendas[0].custo).toBeCloseTo(1000 * 5.0 + 10, 6);   // 5.010
    expect(vendas[0].receita).toBeCloseTo(1200 * 5.5 - 12, 6); // 6.588
    expect(vendas[0].ganho).toBeCloseTo(6588 - 5010, 6);
  });

  it("exterior sem PTAX usa o câmbio da operação e avisa", () => {
    const { vendas, avisos } = apurarVendas(ativos, [
      compra("valu", "2026-01-10", 10, 5100, { valor_bruto: 1000, cambio_usado: 5.1 }),
      venda("valu", "2026-06-10", 10, 1200, { cambio_usado: 5.4 }),
    ], aliq);
    expect(vendas[0].custo).toBeCloseTo(5100, 6);
    expect(vendas[0].receita).toBeCloseTo(6480, 6);
    expect(avisos.map((a) => a.texto).join(" ")).toMatch(/PTAX/);
  });
});

describe("vencimento do DARF", () => {
  it("último dia útil do mês seguinte", () => {
    expect(vencimentoDarf("2026-01-01")).toBe("2026-02-27"); // 28/02/2026 é sábado
    expect(vencimentoDarf("2026-02-01")).toBe("2026-03-31"); // terça
    expect(vencimentoDarf("2026-11-01")).toBe("2026-12-31"); // quinta
  });
  it("pula feriado nacional fixo", () => {
    expect(vencimentoDarf("2026-11-01")).not.toBe("2026-12-25");
    expect(vencimentoDarf("2026-11-01")).toBe("2026-12-31");
  });
});

describe("apuração mensal da B3", () => {
  const base = [compra("etf", "2026-01-05", 100, 10000)];

  it("ETF: 15% do ganho do mês, sem isenção de R$ 20 mil, menos o dedo-duro", () => {
    const { vendas } = apurarVendas(ativos, [...base, venda("etf", "2026-02-10", 10, 1500)], aliq); // custo 1000, ganho 500
    const [fev] = apurarMesesB3(vendas);
    expect(fev.categorias[0].categoria).toBe("rv");
    expect(fev.categorias[0].isento).toBe(false);
    expect(fev.categorias[0].imposto).toBeCloseTo(75, 6);
    expect(fev.irrf).toBeCloseTo(0.08, 2);                  // 0,005% de 1.500 = 0,075 (exibido em centavos)
    expect(fev.darf).toBeCloseTo(74.93, 2);                // 75 − 0,075 = 74,925 → 74,93 (arredondado no fim)
    expect(fev.vencimento).toBe("2026-03-31");
  });

  it("ações: vendas até R$ 20 mil no mês com lucro são isentas", () => {
    const mov = [compra("acao", "2026-01-05", 100, 10000), venda("acao", "2026-02-10", 50, 6000)];
    const [m] = apurarMesesB3(apurarVendas(ativos, mov, aliq).vendas);
    expect(m.categorias[0].isento).toBe(true);
    expect(m.darf).toBe(0);
    const grande = [compra("acao", "2026-01-05", 100, 10000), venda("acao", "2026-02-10", 100, 25000)];
    const [g] = apurarMesesB3(apurarVendas(ativos, grande, aliq).vendas);
    expect(g.categorias[0].isento).toBe(false);
    expect(g.categorias[0].imposto).toBeCloseTo(2250, 6);
  });

  it("prejuízo é compensado nos meses seguintes, na mesma categoria", () => {
    const mov = [
      compra("etf", "2026-01-05", 100, 10000),
      venda("etf", "2026-02-10", 20, 1500),   // custo 2.000: prejuízo de 500
      venda("etf", "2026-03-10", 20, 2900),   // ganho 900
    ];
    const [fev, mar] = apurarMesesB3(apurarVendas(ativos, mov, aliq).vendas);
    expect(fev.categorias[0].prejuizoFinal).toBeCloseTo(500, 6);
    expect(fev.darf).toBe(0);
    expect(mar.categorias[0].compensado).toBeCloseTo(500, 6);
    expect(mar.categorias[0].base).toBeCloseTo(400, 6);
    expect(mar.categorias[0].imposto).toBeCloseTo(60, 6);
    expect(mar.categorias[0].prejuizoFinal).toBe(0);
  });

  it("prejuízo de ETF não compensa ganho de FII", () => {
    const mov = [
      compra("etf", "2026-01-05", 10, 1000), compra("fii", "2026-01-05", 10, 1000),
      venda("etf", "2026-02-10", 10, 500), venda("fii", "2026-02-12", 10, 1500),
    ];
    const [fev] = apurarMesesB3(apurarVendas(ativos, mov, aliq).vendas);
    const fii = fev.categorias.find((c) => c.categoria === "fii")!;
    expect(fii.compensado).toBe(0);
    expect(fii.imposto).toBeCloseTo(100, 6); // 20% de 500
  });

  it("DARF abaixo de R$ 10 acumula para o mês seguinte", () => {
    const mov = [
      compra("etf", "2026-01-05", 1000, 10000),
      venda("etf", "2026-02-10", 10, 140),   // ganho 40 → 6,00 (menos dedo-duro)
      venda("etf", "2026-03-10", 10, 140),   // mais 6,00
    ];
    const [fev, mar] = apurarMesesB3(apurarVendas(ativos, mov, aliq).vendas);
    expect(fev.abaixoMinimo).toBe(true);
    expect(fev.darf).toBe(0);
    expect(mar.acumuladoAnterior).toBeGreaterThan(5);
    expect(mar.abaixoMinimo).toBe(false);
    expect(mar.darf).toBeCloseTo(fev.imposto - fev.irrf + (mar.imposto - mar.irrf), 1);
  });

  it("usa o IR retido informado na operação no lugar do dedo-duro padrão", () => {
    const mov = [compra("etf", "2026-01-05", 100, 10000), venda("etf", "2026-02-10", 10, 1500, { ir_retido: 0.2 })];
    const [fev] = apurarMesesB3(apurarVendas(ativos, mov, aliq).vendas);
    expect(fev.irrf).toBeCloseTo(0.2, 6);
  });
});

describe("exterior (apuração anual)", () => {
  const mov = (ganhoCambio: number): MovIR[] => [
    compra("valu", "2025-03-01", 10, 5000, { valor_bruto: 1000, ptax_compra: 5.0 }),
    venda("valu", "2025-09-01", 10, 1000, { ptax_venda: ganhoCambio }),
  ];

  it("15% sobre o resultado do ano em reais, incluindo a variação cambial", () => {
    const [a] = apurarAnosExterior(apurarVendas(ativos, mov(5.5), aliq).vendas);
    expect(a.ano).toBe(2025);
    expect(a.resultado).toBeCloseTo(500, 6);
    expect(a.imposto).toBeCloseTo(75, 6);
  });

  it("prejuízo do ano compensa nos anos seguintes", () => {
    const movs = [
      compra("valu", "2025-03-01", 20, 10000, { valor_bruto: 2000, ptax_compra: 5.0 }),
      venda("valu", "2025-09-01", 10, 900, { ptax_venda: 5.0 }),  // custo 5.000, receita 4.500: −500
      venda("valu", "2026-02-01", 10, 1100, { ptax_venda: 5.0 }), // receita 5.500: +500
    ];
    const [a25, a26] = apurarAnosExterior(apurarVendas(ativos, movs, aliq).vendas);
    expect(a25.imposto).toBe(0);
    expect(a25.prejuizoFinal).toBeCloseTo(500, 6);
    expect(a26.compensado).toBeCloseTo(500, 6);
    expect(a26.imposto).toBe(0);
  });

  it("exterior não gera DARF mensal", () => {
    expect(apurarMesesB3(apurarVendas(ativos, mov(5.5), aliq).vendas)).toHaveLength(0);
  });
});

describe("renda fixa: retido na fonte", () => {
  it("lista o IR por mês sem DARF; usa a alíquota própria do ativo", () => {
    const { vendas } = apurarVendas(ativos, [compra("lfts", "2026-01-02", 10, 1000), venda("lfts", "2026-02-02", 10, 1100)], aliq);
    const [fev] = apurarFonte(vendas);
    expect(fev.ganho).toBeCloseTo(100, 6);
    expect(fev.ir).toBeCloseTo(25, 6);
    expect(apurarMesesB3(vendas)).toHaveLength(0);
  });
});

describe("situação do DARF", () => {
  const mov = [compra("etf", "2026-01-05", 100, 10000), venda("etf", "2026-02-10", 10, 1500)];
  const [fev] = apurarMesesB3(apurarVendas(ativos, mov, aliq).vendas);

  it("a vencer, vencido e pago", () => {
    expect(situacaoDarf(fev, new Set(), "2026-03-01")).toBe("a_vencer");
    expect(situacaoDarf(fev, new Set(), "2026-04-02")).toBe("vencido");
    expect(situacaoDarf(fev, new Set([fev.competencia]), "2026-04-02")).toBe("pago");
  });

  it("o aviso aparece até 10 dias antes do vencimento e some depois de pago", () => {
    expect(darfsPendentes([fev], new Set(), "2026-03-10")).toHaveLength(0);
    expect(darfsPendentes([fev], new Set(), "2026-03-25")).toHaveLength(1);
    expect(darfsPendentes([fev], new Set(), "2026-04-05")).toHaveLength(1);
    expect(darfsPendentes([fev], new Set([fev.competencia]), "2026-04-05")).toHaveLength(0);
  });
});

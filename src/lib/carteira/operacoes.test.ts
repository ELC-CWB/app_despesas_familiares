import { describe, expect, it } from "vitest";
import { CORRETORA_PADRAO } from "@/lib/carteira/constantes";
import {
  calcularCompra, calcularVenda, corretagem, custosAquisicao, efeitoNaCarteira, excessoAteBorda,
  precoMedio, statusBanda, sugestaoAporte, sugestaoVenda, type AtivoSugestao,
} from "@/lib/carteira/operacoes";

const INTER = CORRETORA_PADRAO; // corretagem B3 0%, exterior 0,20% mín. US$ 2, spread 1,25%, IOF 1,1% / 0,38%

describe("corretagem (REGRAS §5)", () => {
  it("uma ordem de US$ 500 no exterior paga US$ 2", () => {
    // em dólares (dólar = 1): max(500 × 0,2%, 2) = 2
    expect(corretagem(500, true, INTER, 1)).toBe(2);
    expect(corretagem(3000, true, INTER, 1)).toBeCloseTo(6, 9);
  });

  it("na B3 o Inter não cobra corretagem", () => {
    expect(corretagem(10000, false, INTER, 5)).toBe(0);
    expect(corretagem(10000, false, { ...INTER, corr_br_pct: 0.5, corr_br_min: 20 }, 5)).toBe(50);
  });
});

describe("compra", () => {
  it("exterior: remessa, corretagem e valor investido", () => {
    const c = calcularCompra({ valor: 10000, preco: 5, cambio: 5, exterior: true, corretora: INTER, dolar: 5 });
    // remessa = 10.000 × (1,25% + 1,1%) = 235; corretagem = max(9.765 × 0,2%, 2 × 5) = 19,53
    expect(c.spread).toBe(125);
    expect(c.iof).toBe(110);
    expect(c.corretagem).toBe(19.53);
    expect(c.ordem).toBe(9745.47);
    expect(c.desembolso).toBe(10000);
    expect(c.cotas).toBe(389.8188); // 9.745,47 / 5 / 5, 4 casas, para baixo
  });

  it("B3: cotas inteiras com emolumentos de 0,03% cabendo no valor", () => {
    const c = calcularCompra({ valor: 1000, preco: 100, cambio: 1, exterior: false, corretora: INTER, dolar: 5 });
    // 10 cotas = 1.000 + 0,30 de emolumentos > 1.000 → 9 cotas
    expect(c.cotas).toBe(9);
    expect(c.ordem).toBe(900);
    expect(c.emolumentos).toBe(0.27);
    expect(c.desembolso).toBe(900.27);
  });

  it("valor insuficiente não compra nada", () => {
    expect(calcularCompra({ valor: 50, preco: 100, cambio: 1, exterior: false, corretora: INTER, dolar: 5 }).cotas).toBe(0);
  });
});

describe("preço médio e venda (REGRAS §7)", () => {
  const movs = [
    { data: "2025-01-10", tipo: "compra" as const, quantidade: 100, valor_liquido_brl: 10030 },
    { data: "2025-06-10", tipo: "compra" as const, quantidade: 100, valor_liquido_brl: 12030 },
    { data: "2025-08-01", tipo: "venda" as const, quantidade: 50, valor_liquido_brl: 6000 },
    { data: "2025-09-01", tipo: "provento" as const, quantidade: null, valor_liquido_brl: 80 },
  ];

  it("ponderado pelas compras, com custos; venda não muda o preço médio", () => {
    expect(precoMedio(movs, "2025-06-30").pm).toBeCloseTo(110.3, 9);
    const r = precoMedio(movs);
    expect(r.quantidade).toBe(150);
    expect(r.pm).toBeCloseTo(110.3, 9);
  });

  it("IR estimado sobre o ganho em relação ao preço médio", () => {
    const v = calcularVenda({ cotas: 50, preco: 130, cambio: 1, exterior: false, corretora: INTER, dolar: 5, precoMedioBRL: 110.3, aliquotaPct: 15 });
    // bruto 6.500; emolumentos 1,95; ganho = 6.500 − 1,95 − 5.515 = 983,05; IR = 147,46
    expect(v.bruto).toBe(6500);
    expect(v.emolumentos).toBe(1.95);
    expect(v.ganho).toBe(983.05);
    expect(v.ir).toBe(147.46);
    expect(v.liquido).toBe(6350.59);
  });

  it("sem ganho, sem IR", () => {
    const v = calcularVenda({ cotas: 10, preco: 100, cambio: 1, exterior: false, corretora: INTER, dolar: 5, precoMedioBRL: 120, aliquotaPct: 15 });
    expect(v.ir).toBe(0);
  });

  it("exterior: corretagem e câmbio no retorno", () => {
    const v = calcularVenda({ cotas: 100, preco: 10, cambio: 5, exterior: true, corretora: INTER, dolar: 5, precoMedioBRL: 0, aliquotaPct: 0 });
    // bruto R$ 5.000; corretagem = max(10, 2 × 5) = 10; câmbio = 4.990 × 1,63% = 81,34
    expect(v.corretagem).toBe(10);
    expect(v.cambioRetorno).toBe(81.34);
    expect(v.liquido).toBe(4908.66);
  });
});

describe("bandas, efeito e sugestões", () => {
  const ativos: AtivoSugestao[] = [
    { id: "a", codigo: "QLBR11", alvo_pct: 20, banda_pp: null, mercado: "brasil" },
    { id: "b", codigo: "HODL11", alvo_pct: 2.5, banda_pp: 1.25, mercado: "brasil" },
    { id: "c", codigo: "VALU", alvo_pct: 77.5, banda_pp: null, mercado: "exterior" },
  ];
  const valores = { a: 16500, b: 4100, c: 79400 }; // total 100.000

  it("status da banda", () => {
    expect(statusBanda(4.1, 2.5, 1.25)).toBe("acima");
    expect(statusBanda(14, 20, 5)).toBe("abaixo");
    expect(statusBanda(16.5, 20, 5)).toBe("dentro");
  });

  it("efeito de uma compra no percentual de cada ativo", () => {
    const e = efeitoNaCarteira(ativos, valores, { a: 10000 }, ["a"]);
    const a = e.find((l) => l.id === "a")!;
    expect(a.antes).toBeCloseTo(16.5, 9);
    expect(a.depois).toBeCloseTo((26500 / 110000) * 100, 9);
    expect(a.foco).toBe(true);
  });

  it("aporte vai para o ativo com menor real/alvo", () => {
    const s = sugestaoAporte(ativos, valores)!;
    expect(s.ativo.codigo).toBe("QLBR11");
    expect(s.falta).toBeCloseTo(3500, 6);
  });

  it("venda sugere o ativo brasileiro mais acima e o excesso até a borda", () => {
    const s = sugestaoVenda(ativos, valores)!;
    expect(s.ativo.codigo).toBe("HODL11");
    expect(s.excesso).toBeCloseTo(350, 6); // (4,1 − 3,75)% × 100.000
    expect(excessoAteBorda(3, 2.5, 1.25, 100000)).toBe(0);
  });
});

describe("custos de aquisição", () => {
  it("separa investido líquido, spread, IOF e corretagem por ano", () => {
    const movs = [
      { data: "2025-03-01", tipo: "compra" as const, valor_liquido_brl: 10000, spread_valor: 125, iof_valor: 110, corretagem: 19.53, emolumentos: 0, outras_taxas: 0 },
      { data: "2026-03-01", tipo: "compra" as const, valor_liquido_brl: 900.27, spread_valor: 0, iof_valor: 0, corretagem: 0, emolumentos: 0.27, outras_taxas: 0 },
      { data: "2026-04-01", tipo: "venda" as const, valor_liquido_brl: 500, spread_valor: 0, iof_valor: 0, corretagem: 0, emolumentos: 0.15, outras_taxas: 0 },
    ];
    const t = custosAquisicao(movs, null);
    expect(t.operacoes).toBe(2);
    expect(t.liquido).toBeCloseTo(10645.47, 6);
    expect(custosAquisicao(movs, 2026).liquido).toBeCloseTo(900, 6);
  });
});

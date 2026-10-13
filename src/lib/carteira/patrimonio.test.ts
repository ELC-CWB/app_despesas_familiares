import { describe, expect, it } from "vitest";
import {
  avaliarCarteira, cambiosDasCotacoes, investidoLiquido, quantidadesPorAtivo, tickersNecessarios,
  type Cotacao, type MovimentacaoBase,
} from "@/lib/carteira/patrimonio";
import { dataPregao, normalizarPreco, tickerCambio } from "@/lib/market/normalizar";

const cot = (ticker: string, fechamento: number, moeda: string | null, data = "2026-10-13"): Cotacao => ({
  ticker, data, fechamento, moeda, intradiaria: false, atualizado_em: "2026-10-13T22:00:00Z",
});

describe("normalização das cotações", () => {
  it("converte pence (GBp/GBX) em libras", () => {
    expect(normalizarPreco(1234, "GBp")).toEqual({ preco: 12.34, moeda: "GBP" });
    expect(normalizarPreco(1234, "GBX")).toEqual({ preco: 12.34, moeda: "GBP" });
    expect(normalizarPreco(4.97, "USD")).toEqual({ preco: 4.97, moeda: "USD" });
  });

  it("usa o dia do pregão no fuso da bolsa", () => {
    // 13/10/2026 23:30 em São Paulo (UTC−3) = 14/10 02:30 UTC
    const epoch = Date.UTC(2026, 9, 14, 2, 30) / 1000;
    expect(dataPregao(epoch, -3 * 3600)).toBe("2026-10-13");
    expect(dataPregao(epoch, 0)).toBe("2026-10-14");
  });

  it("ticker de câmbio por moeda", () => {
    expect(tickerCambio("USD")).toBe("USDBRL=X");
    expect(tickerCambio("BRL")).toBeNull();
  });
});

describe("posição e investido líquido (REGRAS §6)", () => {
  const movs: MovimentacaoBase[] = [
    { ativo_id: "a", tipo: "compra", quantidade: 100, valor_liquido_brl: 10000 },
    { ativo_id: "a", tipo: "venda", quantidade: 30, valor_liquido_brl: 3500 },
    { ativo_id: "a", tipo: "provento", quantidade: null, valor_liquido_brl: 200 },
    { ativo_id: "b", tipo: "compra", quantidade: 10, valor_liquido_brl: 5100 },
  ];

  it("cotas = compras − vendas; provento não muda cotas", () => {
    expect(quantidadesPorAtivo(movs)).toEqual({ a: 70, b: 10 });
  });

  it("investido líquido = compras − vendas − proventos", () => {
    expect(investidoLiquido(movs)).toBe(10000 - 3500 - 200 + 5100);
  });
});

describe("avaliação da carteira", () => {
  const ativos = [
    { id: "a", codigo: "QLBR11", ticker_cotacao: "QLBR11.SA", moeda: "BRL" },
    { id: "b", codigo: "VALU", ticker_cotacao: "VALU.L", moeda: "USD" },
    { id: "c", codigo: "SEMTICK", ticker_cotacao: null, moeda: "BRL" },
    { id: "d", codigo: "ZERADO", ticker_cotacao: "X.SA", moeda: "BRL" },
  ];
  const cotacoes = {
    "QLBR11.SA": cot("QLBR11.SA", 142.54, "BRL"),
    "VALU.L": cot("VALU.L", 4.97, "USD"),
    "USDBRL=X": cot("USDBRL=X", 5.03, "BRL"),
  };

  it("patrimônio = cotas × cotação × câmbio", () => {
    const r = avaliarCarteira(ativos, { a: 10, b: 1000, c: 5 }, cotacoes);
    expect(r.itens.find((i) => i.ativo_id === "a")?.valor).toBeCloseTo(1425.4, 6);
    expect(r.itens.find((i) => i.ativo_id === "b")?.valor).toBeCloseTo(1000 * 4.97 * 5.03, 6);
    expect(r.total).toBeCloseTo(1425.4 + 1000 * 4.97 * 5.03, 6);
  });

  it("avisa ativo sem ticker; ativo sem cotas não precisa de cotação", () => {
    const r = avaliarCarteira(ativos, { c: 5 }, cotacoes);
    expect(r.itens.find((i) => i.ativo_id === "c")?.aviso).toBe("Sem ticker de cotação");
    expect(r.itens.find((i) => i.ativo_id === "d")?.aviso).toBeNull();
  });

  it("sem câmbio da moeda, o ativo fica com valor zero e aviso", () => {
    const r = avaliarCarteira(ativos, { b: 10 }, { "VALU.L": cot("VALU.L", 4.97, "USD") });
    expect(r.itens.find((i) => i.ativo_id === "b")).toMatchObject({ valor: 0, aviso: "Sem câmbio USD/BRL" });
  });

  it("avisa quando a moeda da cotação difere da cadastrada, mas avalia pela moeda da cotação", () => {
    const r = avaliarCarteira(
      [{ id: "e", codigo: "XYZ", ticker_cotacao: "XYZ.L", moeda: "USD" }],
      { e: 2 },
      { "XYZ.L": cot("XYZ.L", 10, "GBP"), "GBPBRL=X": cot("GBPBRL=X", 6.5, "BRL") },
    );
    expect(r.itens[0]).toMatchObject({ valor: 130, aviso: "Cotação em GBP, ativo cadastrado em USD" });
  });

  it("câmbios e tickers necessários", () => {
    expect(cambiosDasCotacoes(cotacoes)).toEqual({ BRL: 1, USD: 5.03 });
    expect(tickersNecessarios(ativos)).toEqual(["QLBR11.SA", "USDBRL=X", "VALU.L", "X.SA"]);
  });
});

import { describe, expect, it } from "vitest";
import {
  alinhar, emReais, indiceCarteira, indiceCdi, indiceDePreco, inicioDoPeriodo, marcasDoEixo, periodoCabe, rebase, rebaseComum, uniaoDeDatas,
  type MovHistorico,
} from "@/lib/carteira/historico";

const datas = ["2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"];

describe("séries", () => {
  it("une as datas das séries dentro do intervalo, em ordem", () => {
    expect(uniaoDeDatas([[{ data: "2026-01-05" }, { data: "2026-01-02" }], [{ data: "2026-01-05" }, { data: "2026-02-01" }]], "2026-01-01", "2026-01-31"))
      .toEqual(["2026-01-02", "2026-01-05"]);
  });
  it("alinha repetindo o último valor e deixando null antes do primeiro", () => {
    const a = alinhar(datas, [{ data: "2026-01-05", valor: 10 }, { data: "2026-01-07", valor: 12 }]);
    expect(a).toEqual([null, 10, 10, 12, 12]);
  });
  it("preço em reais = preço × câmbio (null se faltar um dos dois)", () => {
    expect(emReais([10, null, 20], [5, 5, null])).toEqual([50, null, null]);
    expect(emReais([10, 20], null)).toEqual([10, 20]);
  });
  it("índice de preço começa em 1 no primeiro dia com valor", () => {
    expect(indiceDePreco([null, 50, 55, 45])).toEqual([null, 1, 1.1, 0.9]);
  });
  it("CDI acumula a taxa diária dos dias úteis a partir do início", () => {
    const cdi = indiceCdi(datas, [{ data: "2026-01-05", valor: 0.05 }, { data: "2026-01-06", valor: 0.05 }], "2026-01-02");
    expect(cdi[0]).toBe(1);
    expect(cdi[1]).toBeCloseTo(1.0005, 8);
    expect(cdi[2]).toBeCloseTo(1.0005 * 1.0005, 8);
    expect(cdi[4]).toBeCloseTo(1.0005 * 1.0005, 8); // dias sem taxa não acumulam
    expect(indiceCdi(datas, [], null)).toEqual([null, null, null, null, null]);
  });
});

describe("rentabilidade da carteira (encadeada, sem efeito de aportes)", () => {
  const precos = { A: [10, 11, 12.1, 12.1, 13.31] as (number | null)[] };

  it("começa no dia da primeira posição e acompanha o preço do ativo", () => {
    const movs: MovHistorico[] = [{ data: "2026-01-02", tipo: "compra", ativo_id: "A", quantidade: 100, valorBRL: 0 }];
    const r = indiceCarteira(datas, movs, precos);
    expect(r.inicio).toBe("2026-01-02");
    expect(r.indice[0]).toBe(1);
    expect(r.indice[1]).toBeCloseTo(1.1, 8);
    expect(r.indice[2]).toBeCloseTo(1.21, 8);
    expect(r.indice[3]).toBeCloseTo(1.21, 8);
    expect(r.indice[4]).toBeCloseTo(1.331, 8);
  });

  it("um aporte não conta como rentabilidade", () => {
    const sem = indiceCarteira(datas, [{ data: "2026-01-02", tipo: "compra", ativo_id: "A", quantidade: 100, valorBRL: 0 }], precos);
    const com = indiceCarteira(datas, [
      { data: "2026-01-02", tipo: "compra", ativo_id: "A", quantidade: 100, valorBRL: 0 },
      { data: "2026-01-06", tipo: "compra", ativo_id: "A", quantidade: 900, valorBRL: 0 },
    ], precos);
    for (let i = 0; i < datas.length; i++) expect(com.indice[i]).toBeCloseTo(sem.indice[i] as number, 8);
  });

  it("venda reduz a posição sem virar ganho ou perda", () => {
    const r = indiceCarteira(datas, [
      { data: "2026-01-02", tipo: "compra", ativo_id: "A", quantidade: 100, valorBRL: 0 },
      { data: "2026-01-06", tipo: "venda", ativo_id: "A", quantidade: 50, valorBRL: 0 },
    ], precos);
    expect(r.indice[4]).toBeCloseTo(1.331, 8);
  });

  it("proventos contam como ganho no dia em que entram", () => {
    const r = indiceCarteira(datas, [
      { data: "2026-01-02", tipo: "compra", ativo_id: "A", quantidade: 100, valorBRL: 0 },
      { data: "2026-01-07", tipo: "provento", ativo_id: "A", quantidade: null, valorBRL: 121 },
    ], precos);
    // em 07/01 o preço não muda; o provento de R$ 121 sobre R$ 1.210 rende 10%
    expect(r.indice[3]).toBeCloseTo(1.21 * 1.1, 8);
  });

  it("sem posição ou sem preço, não há índice", () => {
    expect(indiceCarteira(datas, [], precos).indice.every((v) => v == null)).toBe(true);
    expect(indiceCarteira(datas, [{ data: "2026-01-02", tipo: "compra", ativo_id: "B", quantidade: 5, valorBRL: 0 }], precos).inicio).toBeNull();
  });

  it("junta ativos com pesos diferentes", () => {
    const p2 = { A: [10, 11, 11, 11, 11] as (number | null)[], B: [10, 10, 12, 12, 12] as (number | null)[] };
    const r = indiceCarteira(datas, [
      { data: "2026-01-02", tipo: "compra", ativo_id: "A", quantidade: 100, valorBRL: 0 },
      { data: "2026-01-02", tipo: "compra", ativo_id: "B", quantidade: 300, valorBRL: 0 },
    ], p2);
    // dia 2: A +100 em R$ 1.000, B 0 em R$ 3.000 → +2,5%; dia 3: B +600 em R$ 4.100 (A 1.100 + B 3.000)
    expect(r.indice[1]).toBeCloseTo(1.025, 8);
    expect(r.indice[2]).toBeCloseTo(1.025 * (1 + 600 / 4100), 8);
  });
});

describe("período e base", () => {
  const dts = ["2026-01-02", "2026-03-02", "2026-06-01", "2026-09-01", "2026-10-15"];
  it("início do período, limitado à primeira data", () => {
    expect(inicioDoPeriodo("6m", "2026-10-15", "2026-01-02")).toBe("2026-04-15");
    expect(inicioDoPeriodo("ano", "2026-10-15", "2026-03-10")).toBe("2026-03-10");
    expect(inicioDoPeriodo("tudo", "2026-10-15", "2026-01-02")).toBe("2026-01-02");
    expect(inicioDoPeriodo("24m", "2026-10-15", "2026-01-02")).toBe("2026-01-02");
  });
  it("rebaseComum: todas partem de 0% no mesmo dia, ancorado na carteira", () => {
    const cart = [null, 1, 1.1, 1.21, 1.331];
    const outro = [1, 1.02, 1.04, 1.06, 1.08];
    const r = rebaseComum(dts, [cart, outro], "2026-01-02", cart);
    expect(r.datas[0]).toBe("2026-03-02");
    expect(r.series[0][0]).toBe(0);
    expect(r.series[0][3]).toBeCloseTo(33.1, 6);
    expect(r.series[1][0]).toBe(0);
    expect(r.series[1][3]).toBeCloseTo((1.08 / 1.02 - 1) * 100, 6);
  });
  it("rebase: cada linha parte de 0% no seu primeiro dia dentro do período", () => {
    const a = [1, 1.1, 1.2, 1.3, 1.4];
    const b = [null, null, 2, 2.2, 2.4];
    const r = rebase(dts, [a, b], "2026-03-02");
    expect(r.datas[0]).toBe("2026-03-02");
    expect(r.series[0][0]).toBe(0);
    expect(r.series[1][0]).toBeNull();
    expect(r.series[1][1]).toBe(0);
    expect(r.series[1][3]).toBeCloseTo(20, 6);
  });
});

describe("eixo", () => {
  it("marcas bonitas que cobrem o intervalo", () => {
    const m = marcasDoEixo(-3.2, 17.6);
    expect(m[0]).toBeLessThanOrEqual(-3.2);
    expect(m.at(-1)).toBeGreaterThanOrEqual(17.6);
    expect(m).toContain(0);
    expect(new Set(m.map((v, i) => (i ? +(v - m[i - 1]).toFixed(6) : 0)).slice(1)).size).toBe(1); // passo constante
  });
  it("intervalo de um ponto só não quebra", () => {
    expect(marcasDoEixo(5, 5).length).toBeGreaterThan(1);
  });
});

describe("períodos longos", () => {
  it("3, 5 e 10 anos começam no mesmo dia, anos atrás", () => {
    expect(inicioDoPeriodo("36m", "2026-10-15", "2010-01-01")).toBe("2023-10-15");
    expect(inicioDoPeriodo("60m", "2026-10-15", "2010-01-01")).toBe("2021-10-15");
    expect(inicioDoPeriodo("120m", "2026-10-15", "2010-01-01")).toBe("2016-10-15");
  });
  it("um período maior que o histórico é limitado à primeira data", () => {
    expect(inicioDoPeriodo("60m", "2026-10-15", "2024-03-05")).toBe("2024-03-05");
  });
  it("o período cabe nos dados disponíveis (com folga de 15 dias para o 10 anos)", () => {
    expect(periodoCabe("12m", "2026-10-15", "2016-10-27")).toBe(true);
    expect(periodoCabe("120m", "2026-10-15", "2016-10-27")).toBe(true);   // 12 dias antes do primeiro dado
    expect(periodoCabe("120m", "2026-10-15", "2020-01-01")).toBe(false);
    expect(periodoCabe("60m", "2026-10-15", "2020-01-01")).toBe(true);
    expect(periodoCabe("tudo", "2026-10-15", "2020-01-01")).toBe(true);
    expect(periodoCabe("ano", "2026-10-15", "2026-05-01")).toBe(false);
  });
});

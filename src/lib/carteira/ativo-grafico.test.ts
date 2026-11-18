import { describe, expect, it } from "vitest";
import { PERIODOS_GRAFICO, PERIODO_PADRAO, variacaoPercentual } from "./ativo-grafico";

describe("variacaoPercentual", () => {
  it("calcula a variação entre o primeiro e o último ponto", () => {
    expect(variacaoPercentual([
      { data: "2026-01-02", fechamento: 100 },
      { data: "2026-06-01", fechamento: 120 },
      { data: "2026-11-17", fechamento: 110 },
    ])).toBeCloseTo(10);
  });

  it("devolve null com menos de dois pontos ou início zerado", () => {
    expect(variacaoPercentual([])).toBeNull();
    expect(variacaoPercentual([{ data: "2026-01-02", fechamento: 100 }])).toBeNull();
    expect(variacaoPercentual([{ data: "a", fechamento: 0 }, { data: "b", fechamento: 5 }])).toBeNull();
  });
});

describe("PERIODOS_GRAFICO", () => {
  it("tem os seis períodos pedidos e o padrão é 1 ano", () => {
    expect(PERIODOS_GRAFICO.map((p) => p.id)).toEqual(["1m", "3m", "6m", "1a", "5a", "max"]);
    expect(PERIODO_PADRAO).toBe("1a");
    expect(PERIODOS_GRAFICO.find((p) => p.id === "1a")?.range).toBe("1y");
  });
});

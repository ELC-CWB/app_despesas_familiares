import { describe, expect, it } from "vitest";
import { parseDecimal, paraTexto } from "@/lib/carteira/numeros";

describe("parseDecimal (pt-BR)", () => {
  it("aceita vírgula decimal e ponto de milhar", () => {
    expect(parseDecimal("3,5")).toBe(3.5);
    expect(parseDecimal("1.234,56")).toBe(1234.56);
    expect(parseDecimal("3.000")).toBe(3000);
    expect(parseDecimal("R$ 850.000,00")).toBe(850000);
    expect(parseDecimal("0,20%")).toBe(0.2);
  });

  it("aceita ponto decimal quando não parece milhar", () => {
    expect(parseDecimal("0.5")).toBe(0.5);
    expect(parseDecimal("12.75")).toBe(12.75);
  });

  it("vazio ou inválido vira null", () => {
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("  ")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal(null)).toBeNull();
  });

  it("número passa direto", () => {
    expect(parseDecimal(2.5)).toBe(2.5);
  });
});

describe("paraTexto", () => {
  it("formata para edição sem separador de milhar", () => {
    expect(paraTexto(3.5)).toBe("3,5");
    expect(paraTexto(1234.5)).toBe("1234,5");
    expect(paraTexto(null)).toBe("");
  });

  it("volta ao mesmo número", () => {
    for (const v of [0, 0.07, 1.25, 30, 850000, 1234.5678]) {
      expect(parseDecimal(paraTexto(v))).toBe(v);
    }
  });
});

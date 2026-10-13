import { describe, expect, it } from "vitest";
import {
  alvoDoBloco, alvosFecham100, bandaEfetiva, bandaSugerida, clarear, foraDaBanda,
  patrimonioFimAcumulacao, resumoSoma, retiradaMaxPerpetua, somaAlvos, taxaMediaPonderada,
  tonsDosBlocos, vereditoPerpetuidade,
} from "@/lib/carteira/regras";

// Carteira de exemplo da SPEC §2 (alvo, taxa a.a.)
const EXEMPLO = [
  { codigo: "VALU", bloco_id: "ext", alvo_pct: 30, taxa_adm_pct: 0.07 },
  { codigo: "IWVL", bloco_id: "ext", alvo_pct: 10, taxa_adm_pct: 0.25 },
  { codigo: "IWQU", bloco_id: "ext", alvo_pct: 10, taxa_adm_pct: 0.25 },
  { codigo: "QLBR11", bloco_id: "acb", alvo_pct: 20, taxa_adm_pct: 0.5 },
  { codigo: "LFTS11", bloco_id: "rf", alvo_pct: 10, taxa_adm_pct: 0.19 },
  { codigo: "B5MB11", bloco_id: "rf", alvo_pct: 15, taxa_adm_pct: 0.2 },
  { codigo: "GOLD11", bloco_id: "alt", alvo_pct: 2.5, taxa_adm_pct: 0.55 },
  { codigo: "HODL11", bloco_id: "alt", alvo_pct: 2.5, taxa_adm_pct: 0.4 },
];

describe("banda 5/25 (REGRAS §1)", () => {
  it("segue os exemplos da regra", () => {
    expect(bandaSugerida(30)).toBe(5);
    expect(bandaSugerida(10)).toBe(2.5);
    expect(bandaSugerida(2.5)).toBe(0.625);
  });

  it("banda vazia usa a sugestão; banda informada prevalece", () => {
    expect(bandaEfetiva(10, null)).toBe(2.5);
    expect(bandaEfetiva(2.5, 1.25)).toBe(1.25);
    expect(bandaEfetiva(5, 0)).toBe(0);
  });

  it("fora da banda só quando |real − alvo| passa da banda", () => {
    expect(foraDaBanda(12.5, 10, 2.5)).toBe(false); // na borda
    expect(foraDaBanda(12.6, 10, 2.5)).toBe(true);
    expect(foraDaBanda(7.4, 10, 2.5)).toBe(true);
  });
});

describe("alvos e taxa média (SPEC §2)", () => {
  it("a carteira de exemplo fecha 100%", () => {
    expect(somaAlvos(EXEMPLO)).toBe(100);
    expect(alvosFecham100(100)).toBe(true);
    expect(alvosFecham100(99.9)).toBe(false);
  });

  it("alvo do bloco é a soma dos ativos", () => {
    expect(alvoDoBloco("ext", EXEMPLO)).toBe(50);
    expect(alvoDoBloco("rf", EXEMPLO)).toBe(25);
    expect(alvoDoBloco("alt", EXEMPLO)).toBe(5);
  });

  it("taxa média ponderada do exemplo é 0,24% a.a.", () => {
    expect(taxaMediaPonderada(EXEMPLO)).toBeCloseTo(0.24, 2);
  });

  it("resumo da soma usa o texto do protótipo", () => {
    const f = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    expect(resumoSoma(100, f)).toBe("100% ✓");
    expect(resumoSoma(95, f)).toBe("95% · faltam 5 p.p.");
    expect(resumoSoma(102.5, f)).toBe("102,5% · sobram 2,5 p.p.");
  });
});

describe("cores", () => {
  it("clarear vai do tom original ao branco", () => {
    expect(clarear("#8EB6E3", 0)).toBe("#8eb6e3");
    expect(clarear("#8EB6E3", 1)).toBe("#ffffff");
  });

  it("cada bloco recebe um tom da cor da sua geografia", () => {
    const tons = tonsDosBlocos(
      [{ id: "g1", cor: "azul" }, { id: "g2", cor: "verde" }],
      [{ id: "a", geografia_id: "g1" }, { id: "b", geografia_id: "g1" }, { id: "c", geografia_id: "g2" }],
    );
    expect(tons.a).toBe(clarear("#8EB6E3", 0.3));
    expect(tons.b).toBe(clarear("#8EB6E3", 0.7));
    expect(tons.c).toBe(clarear("#8DCB9F", 0.4));
  });
});

describe("plano (REGRAS §2)", () => {
  it("retirada máxima perpétua com r = 3% é 2,913%", () => {
    expect(retiradaMaxPerpetua(3)).toBeCloseTo(2.913, 3);
  });

  it("projeção da acumulação compõe aporte anual e rentabilidade", () => {
    expect(patrimonioFimAcumulacao(1000, 0, 1, 10)).toBeCloseTo(1100, 6);
    expect(patrimonioFimAcumulacao(0, 100, 2, 0)).toBe(2400);
    expect(patrimonioFimAcumulacao(0, 100, 1, 10)).toBeCloseTo(1320, 6);
  });

  it("veredito verde, amarelo e vermelho", () => {
    expect(vereditoPerpetuidade(2.5, 3, 6)).toBe("verde");
    expect(vereditoPerpetuidade(3.5, 3, 6)).toBe("amarelo");
    expect(vereditoPerpetuidade(6, 3, 6)).toBe("vermelho");
  });
});

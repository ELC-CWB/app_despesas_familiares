import { describe, expect, it } from "vitest";
import { montarAlocacao, resumoStatus } from "@/lib/carteira/alocacao";
import { ANEIS, arco, calcularSetores, ponto } from "@/lib/carteira/grafico";
import type { Ativo, Bloco, Geografia } from "@/lib/carteira/tipos";

// Carteira do protótipo (SPEC §2): alvo, banda, % real e patrimônio de R$ 850.000
const geografias: Geografia[] = [
  { id: "gl", nome: "Global", cor: "azul", ordem: 0 },
  { id: "br", nome: "Brasil", cor: "verde", ordem: 1 },
];
const blocos: Bloco[] = [
  { id: "ext", geografia_id: "gl", nome: "Ações globais", nome_curto: "Ações", banda_pp: 5, ordem: 0 },
  { id: "alt", geografia_id: "gl", nome: "Alternativos", nome_curto: "Altern.", banda_pp: 2.5, ordem: 1 },
  { id: "acb", geografia_id: "br", nome: "Ações Brasil", nome_curto: "Ações", banda_pp: 5, ordem: 2 },
  { id: "rf", geografia_id: "br", nome: "Renda fixa", nome_curto: null, banda_pp: 5, ordem: 3 },
];
const ativo = (id: string, bloco_id: string, alvo_pct: number, banda_pp: number | null, ordem: number): Ativo => ({
  id, codigo: id, ticker_cotacao: null, tipo: "etf_acoes", mercado: "brasil", moeda: "BRL", bloco_id,
  corretora_id: null, gestora: null, alvo_pct, banda_pp, taxa_adm_pct: 0, ordem,
});
const ativos: Ativo[] = [
  ativo("VALU", "ext", 30, null, 0), ativo("IWVL", "ext", 10, null, 1), ativo("IWQU", "ext", 10, null, 2),
  ativo("GOLD11", "alt", 2.5, 1.25, 3), ativo("HODL11", "alt", 2.5, 1.25, 4),
  ativo("QLBR11", "acb", 20, null, 5), ativo("LFTS11", "rf", 10, null, 6), ativo("B5MB11", "rf", 15, null, 7),
];
const REAL: Record<string, number> = { VALU: 33.6, IWVL: 11.2, IWQU: 8.5, GOLD11: 3.0, HODL11: 4.1, QLBR11: 16.5, LFTS11: 10.6, B5MB11: 12.5 };
const valores = Object.fromEntries(Object.entries(REAL).map(([k, v]) => [k, (v / 100) * 850000]));

describe("hierarquia (SPEC §4.2)", () => {
  const a = montarAlocacao(geografias, blocos, ativos, valores);
  const no = (id: string) => a.nos.find((n) => n.id === id)!;

  it("soma alvo e real de baixo para cima", () => {
    expect(no("ext").alvo).toBe(50);
    expect(no("ext").real).toBeCloseTo(53.3, 6);
    expect(no("gl").alvo).toBe(55);
    expect(no("br").alvo).toBe(45);
    expect(a.total).toBeCloseTo(850000, 4);
  });

  it("só o HODL11 está fora da banda (a banda dos blocos entra na conta)", () => {
    expect(a.fora.map((n) => n.nome)).toEqual(["HODL11"]);
    expect(no("HODL11").desvio).toBeCloseTo(1.6, 6);
    expect(no("HODL11").diferenca).toBeCloseTo(13600, 4);
    expect(no("alt").fora).toBe(false); // 7,1% contra 5% ± 2,5
  });

  it("banda vazia usa a regra 5/25; a do bloco editável prevalece", () => {
    expect(no("VALU").banda).toBe(5);
    expect(no("IWVL").banda).toBe(2.5);
    expect(no("alt").banda).toBe(2.5);
    const estreito = montarAlocacao(geografias, blocos.map((b) => (b.id === "alt" ? { ...b, banda_pp: 1 } : b)), ativos, valores);
    expect(estreito.fora.map((n) => n.nome)).toEqual(["Alternativos", "HODL11"]);
  });

  it("ordem de exibição: geografia, seus blocos e os ativos de cada bloco", () => {
    expect(a.nos.map((n) => n.id).slice(0, 8)).toEqual(["gl", "ext", "VALU", "IWVL", "IWQU", "alt", "GOLD11", "HODL11"]);
    expect(no("ext").rotulo).toBe("Ações");
    expect(no("rf").rotulo).toBe("Renda fixa");
  });

  it("textos da faixa de status", () => {
    expect(resumoStatus(a)).toMatchObject({ fora: true, titulo: "Sua carteira está fora da estratégia definida", detalhe: "Fora da banda: HODL11" });
    const dentro = montarAlocacao(geografias, blocos, ativos, Object.fromEntries(ativos.map((x) => [x.id, x.alvo_pct * 8500])));
    expect(resumoStatus(dentro)).toMatchObject({ fora: false, titulo: "Sua carteira está dentro da estratégia" });
  });

  it("sem patrimônio não há desvio nem faixa vermelha", () => {
    const vazia = montarAlocacao(geografias, blocos, ativos, {});
    expect(vazia.semPosicoes).toBe(true);
    expect(vazia.fora).toEqual([]);
    expect(resumoStatus(vazia).titulo).toBe("Sem posições ainda");
  });

  it("blocos sem ativos e geografias sem blocos não aparecem", () => {
    const extra = montarAlocacao(
      [...geografias, { id: "x", nome: "Vazia", cor: "roxo", ordem: 2 }],
      [...blocos, { id: "vazio", geografia_id: "br", nome: "Vazio", nome_curto: null, banda_pp: null, ordem: 9 }],
      ativos, valores,
    );
    expect(extra.nos.some((n) => n.id === "vazio" || n.id === "x")).toBe(false);
  });
});

describe("gráfico em 3 anéis", () => {
  const nos = montarAlocacao(geografias, blocos, ativos, valores).nos;
  const setores = calcularSetores(nos);
  const s = (id: string) => setores.find((x) => x.id === id)!;

  it("os ângulos seguem o alvo e completam a volta", () => {
    expect(s("gl").a0).toBe(0);
    expect(s("gl").a1).toBeCloseTo(0.55 * 360, 6);
    expect(s("br").a1).toBeCloseTo(360, 6);
    expect(s("VALU").a1 - s("VALU").a0).toBeCloseTo(0.3 * 360, 6);
  });

  it("os filhos ficam dentro do setor do pai", () => {
    for (const n of nos.filter((x) => x.pai)) {
      expect(s(n.id).a0).toBeGreaterThanOrEqual(s(n.pai!).a0 - 1e-9);
      expect(s(n.id).a1).toBeLessThanOrEqual(s(n.pai!).a1 + 1e-9);
    }
  });

  it("desvio fora da banda: sólido se sobra, hachurado se falta, só onde há desvio", () => {
    expect(s("HODL11").tipoDesvio).toBe("sobra");
    expect(s("VALU").desvio).toBeNull();
    const falta = calcularSetores(montarAlocacao(geografias, blocos, ativos, { ...valores, QLBR11: 0.1 * 850000 }).nos);
    expect(falta.find((x) => x.id === "QLBR11")!.tipoDesvio).toBe("falta");
  });

  it("rótulos curvos só quando cabem no arco", () => {
    expect(s("VALU").letras.map((l) => l.ch).join("")).toBe("VALU");
    expect(s("GOLD11").letras).toEqual([]); // 9° de arco não comporta 6 letras
  });

  it("cada anel usa o seu raio", () => {
    const [x, y] = ponto(ANEIS[2][0], 90);
    expect(x).toBeCloseTo(200 + ANEIS[2][0], 6);
    expect(y).toBeCloseTo(200, 6);
  });

  it("arco de volta inteira não some", () => {
    expect(arco(34, 78, 0, 360)).toContain("A 78 78 0 1 1");
  });

  it("sem alvos não desenha nada", () => {
    expect(calcularSetores([])).toEqual([]);
  });
});

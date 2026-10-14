import { describe, expect, it } from "vitest";
import {
  anosDesde, corrigir, descreverMudancas, dinheiroCurto, fatoresPorAno, fatorIpcaAte, fraseSustentabilidade,
  horizonte, interpolar, projetar, projetarTunel, rentPessEfetiva, statusTunel, textoVeredito, type IpcaMes, type Premissas,
} from "@/lib/carteira/plano";

const base: Premissas = {
  ano_inicio: 2024, patrimonio_inicial: 50000, aporte_mensal: 5000, anos_aporte: 20, perpetuo: true,
  anos_usufruto: null, retirada_pct: 3.5, rent_pess_pct: 3, rent_otim_pct: 6,
};

describe("projeção anual (REGRAS §2)", () => {
  it("acumulação: v[t+1] = (v[t] + aporte×12) × (1 + r)", () => {
    const { valores } = projetar(base, 3);
    expect(valores[0]).toBe(50000);
    expect(valores[1]).toBeCloseTo((50000 + 60000) * 1.03, 6);
    expect(valores[2]).toBeCloseTo((valores[1] + 60000) * 1.03, 6);
  });

  it("horizonte: perpétuo exibe 40 anos de usufruto; com prazo usa os anos informados", () => {
    expect(horizonte(base)).toBe(60);
    expect(horizonte({ ...base, perpetuo: false, anos_usufruto: 25 })).toBe(45);
    expect(projetar(base, 3).valores).toHaveLength(61);
  });

  it("usufruto: retirada fixa em termos reais, definida no início do usufruto", () => {
    const { valores, saqueAnual } = projetar(base, 3);
    expect(saqueAnual).toBeCloseTo(valores[20] * 0.035, 6);
    expect(valores[21]).toBeCloseTo((valores[20] - saqueAnual) * 1.03, 6);
  });

  it("retirada acima do máximo perpétuo esgota o patrimônio; o ano é o primeiro com v[t] − W ≤ 0", () => {
    const p: Premissas = { ...base, perpetuo: false, anos_usufruto: 40, retirada_pct: 8, patrimonio_inicial: 100000, aporte_mensal: 0, anos_aporte: 1 };
    const r = projetar(p, 3);
    expect(r.esgota).toBeGreaterThan(0);
    expect(r.valores[r.esgota] - r.saqueAnual).toBeLessThanOrEqual(0);
    expect(r.valores[r.esgota - 1] - r.saqueAnual).toBeGreaterThan(0);
    expect(Math.min(...r.valores)).toBeGreaterThanOrEqual(0);
  });

  it("retirada perpétua máxima com r = 3% mantém o patrimônio real", () => {
    // 2,913% = 3/103: o patrimônio no fim de cada ano de usufruto volta ao valor inicial do usufruto
    const p: Premissas = { ...base, aporte_mensal: 0, anos_aporte: 0, patrimonio_inicial: 1_000_000, retirada_pct: (3 / 103) * 100 };
    const { valores } = projetar(p, 3);
    expect(valores[10]).toBeCloseTo(1_000_000, 4);
  });

  it("a pessimista fica no mínimo 0,5 abaixo da otimista", () => {
    expect(rentPessEfetiva(6, 6)).toBe(5.5);
    expect(rentPessEfetiva(3, 6)).toBe(3);
    const t = projetarTunel({ ...base, rent_pess_pct: 7, rent_otim_pct: 6 });
    expect(t.pess.valores.at(-1)!).toBeLessThan(t.otim.valores.at(-1)!);
  });
});

describe("inflação: o plano é corrigido, o patrimônio não", () => {
  // IPCA de 1% ao mês em todos os meses de 2024 e 2025
  const ipca: IpcaMes[] = Array.from({ length: 24 }, (_, i) => ({
    competencia: `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`, variacao_pct: 1,
  }));

  it("fator = produto dos meses inteiros já encerrados desde 1º de janeiro do ano de início", () => {
    expect(fatorIpcaAte(ipca, 2024, "2025-01-01")).toBeCloseTo(1.01 ** 12, 9);
    // em 15/03/2025 o mês de março ainda não fechou: entram jan/24 a fev/25 (14 meses)
    expect(fatorIpcaAte(ipca, 2024, "2025-03-15")).toBeCloseTo(1.01 ** 14, 9);
    expect(fatorIpcaAte([], 2024, "2025-01-01")).toBe(1);
  });

  it("anos futuros não ganham inflação: o fator para de crescer em hoje", () => {
    const f = fatoresPorAno(ipca, 2024, "2025-03-15", 6);
    expect(f[0]).toBe(1);
    expect(f[1]).toBeCloseTo(1.01 ** 12, 9);       // 1º/jan/2025, já passou
    expect(f[2]).toBeCloseTo(1.01 ** 14, 9);       // 1º/jan/2026 é futuro: vale o fator de hoje
    expect(f[6]).toBeCloseTo(1.01 ** 14, 9);
  });

  it("corrigir multiplica cada ano do túnel pelo seu fator", () => {
    expect(corrigir([100, 100, 100], [1, 1.1, 1.2])).toEqual([100, 110.00000000000001, 120]);
  });

  it("dentro/abaixo/acima do túnel é o mesmo que deflacionar o patrimônio", () => {
    const F = 1.1, plano = { pess: 100000, otim: 140000 };
    const nominal = 150000;
    const a = statusTunel(nominal, { pess: plano.pess * F, otim: plano.otim * F });   // plano corrigido
    const b = statusTunel(nominal / F, plano);                                          // patrimônio deflacionado
    expect(a.tipo).toBe(b.tipo);
    expect(a.tipo).toBe("dentro");
    expect(statusTunel(100000, { pess: 110000, otim: 154000 })).toEqual({ tipo: "abaixo", diferenca: 10000 });
    expect(statusTunel(160000, { pess: 110000, otim: 154000 })).toEqual({ tipo: "acima", diferenca: 6000 });
    expect(statusTunel(1, null).tipo).toBe("fora");
  });
});

describe("tempo e interpolação", () => {
  it("anos desde 1º de janeiro: fim de ano dá inteiro", () => {
    expect(anosDesde(2024, "2024-12-31")).toBeCloseTo(1, 9);
    expect(anosDesde(2024, "2025-12-31")).toBeCloseTo(2, 9);
    expect(anosDesde(2024, "2024-01-01")).toBeCloseTo(1 / 366, 9);
    expect(anosDesde(2024, "2025-07-02")).toBeCloseTo(1.5, 1);
  });

  it("interpola entre anos e limita nas pontas", () => {
    expect(interpolar([0, 10, 20], 0.5)).toBe(5);
    expect(interpolar([0, 10, 20], 1.25)).toBe(12.5);
    expect(interpolar([0, 10, 20], 9)).toBe(20);
    expect(interpolar([0, 10, 20], -1)).toBe(0);
  });
});

describe("textos", () => {
  it("veredito traz a retirada máxima perpétua com os valores do protótipo", () => {
    const t = textoVeredito("vermelho", { ...base, retirada_pct: 8 }, 1000);
    expect(t.titulo).toBe("Não é perpétua");
    expect(t.texto).toContain("2,9% ao ano");
    expect(textoVeredito("verde", base, 0).titulo).toBe("Perpétua mesmo no cenário pessimista");
    expect(textoVeredito("amarelo", { ...base, retirada_pct: 4 }, 0).titulo).toBe("Perpétua só no cenário otimista");
  });

  it("frase de sustentabilidade: esgota, diminui ou se mantém", () => {
    const esgota: Premissas = { ...base, perpetuo: false, anos_usufruto: 40, retirada_pct: 8, patrimonio_inicial: 100000, aporte_mensal: 0, anos_aporte: 1 };
    expect(fraseSustentabilidade(esgota, projetarTunel(esgota), 1).tom).toBe("vermelho");
    expect(fraseSustentabilidade({ ...base, retirada_pct: 2 }, projetarTunel({ ...base, retirada_pct: 2 }), 1).tom).toBe("verde");
    expect(fraseSustentabilidade({ ...base, retirada_pct: 3 }, projetarTunel({ ...base, retirada_pct: 3 }), 1).tom).toBe("ambar");
  });

  it("lista o que mudou entre duas versões", () => {
    expect(descreverMudancas(base, { ...base, aporte_mensal: 6000, retirada_pct: 4 })).toEqual(["aporte mensal", "retirada"]);
    expect(descreverMudancas(base, base)).toEqual([]);
  });

  it("dinheiro curto", () => {
    expect(dinheiroCurto(850000)).toBe("R$ 850 mil");
    expect(dinheiroCurto(1_200_000)).toBe("R$ 1,2 mi");
  });
});

describe("séries do patrimônio", () => {
  const fotos = [
    { data: "2024-06-14", patrimonio: 100, investido: 90 },
    { data: "2024-06-28", patrimonio: 110, investido: 95 },   // a última do mês vence
    { data: "2024-12-31", patrimonio: 150, investido: 120 },
    { data: "2025-12-31", patrimonio: 300, investido: 200 },
  ];

  it("série: ponto de partida, último valor de cada mês e hoje", async () => {
    const { serieNominal } = await import("@/lib/carteira/plano");
    const s = serieNominal(fotos, 2024, 80, "2026-10-13", 400);
    expect(s[0]).toEqual({ t: 0, v: 80 });
    expect(s.map((p) => p.v)).toEqual([80, 110, 150, 300, 400]);
    expect(s.find((p) => p.v === 150)!.t).toBeCloseTo(1, 9);
    expect(s.at(-1)!.t).toBeCloseTo(anosDesde(2024, "2026-10-13"), 9);
    expect(s.every((p, i) => i === 0 || p.t >= s[i - 1].t)).toBe(true);
  });

  it("série: plano que ainda não começou não tem pontos reais", async () => {
    const { serieNominal } = await import("@/lib/carteira/plano");
    expect(serieNominal(fotos, 2030, 80, "2026-10-13", 400)).toEqual([{ t: 0, v: 80 }]);
  });

  it("barras: última foto de cada ano encerrado e hoje no ano corrente", async () => {
    const { barrasPorAno } = await import("@/lib/carteira/plano");
    expect(barrasPorAno(fotos, 2026, 400, 250)).toEqual([
      { ano: 2024, patrimonio: 150, investido: 120 },
      { ano: 2025, patrimonio: 300, investido: 200 },
      { ano: 2026, patrimonio: 400, investido: 250 },
    ]);
  });
});

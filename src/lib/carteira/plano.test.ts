import { describe, expect, it } from "vitest";
import {
  anosDesde, corrigir, descreverMudancas, dinheiroCurto, fatoresPorAno, fatorIpcaAte, fraseSustentabilidade,
  anosAporteEfetivo, barrasPlanejadas, descreverRevisao, horizonte, investidoPlanejado, interpolar, parametrosDoAno, projetar, projetarTunel, rentPessEfetiva, statusTunel, temposDasRevisoes, textoVeredito,
  type IpcaMes, type Premissas, type Revisao,
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

describe("revisões do plano (a partir de um ano)", () => {
  const rev = (ano: number, o: Partial<Revisao> = {}): Revisao => ({ ano, aporte_mensal: null, rent_pess_pct: null, rent_otim_pct: null, retirada_pct: null, fim_aporte: null, ...o });
  const p = (revisoes: Revisao[], extra: Partial<Premissas> = {}): Premissas => ({ ...base, anos_aporte: 10, perpetuo: false, anos_usufruto: 5, revisoes, ...extra });

  it("sem revisões, o resultado é o mesmo de antes", () => {
    expect(projetar(p([]), 4).valores).toEqual(projetar({ ...base, anos_aporte: 10, perpetuo: false, anos_usufruto: 5 }, 4).valores);
  });

  it("parâmetros do ano: o que não foi revisto continua; revisões se acumulam em ordem", () => {
    const pr = p([rev(2030, { aporte_mensal: 8000 }), rev(2034, { rent_otim_pct: 5, retirada_pct: 3 })]);
    expect(parametrosDoAno(pr, 5)).toEqual({ aporte: 5000, pess: 3, otim: 6, retirada: 3.5 }); // 2029
    expect(parametrosDoAno(pr, 6)).toEqual({ aporte: 8000, pess: 3, otim: 6, retirada: 3.5 }); // 2030
    expect(parametrosDoAno(pr, 10)).toEqual({ aporte: 8000, pess: 3, otim: 5, retirada: 3 });  // 2034
  });

  it("aporte revisto vale só a partir do ano da revisão", () => {
    const sem = projetar(p([]), 3).valores;
    const com = projetar(p([rev(2030, { aporte_mensal: 8000 })]), 3).valores;
    for (let t = 0; t <= 6; t++) expect(com[t]).toBeCloseTo(sem[t], 6); // até o início de 2030 (t = 6) nada muda
    expect(com[7]).toBeCloseTo((com[6] + 8000 * 12) * 1.03, 6);
  });

  it("rentabilidade revista muda a taxa do ano da revisão em diante, em cada cenário", () => {
    const t = projetarTunel(p([rev(2030, { rent_pess_pct: 2, rent_otim_pct: 4 })]));
    const sem = projetarTunel(p([]));
    expect(t.otim.valores[6]).toBeCloseTo(sem.otim.valores[6], 6);
    expect(t.otim.valores[7]).toBeCloseTo((t.otim.valores[6] + 60000) * 1.04, 6);
    expect(t.pess.valores[7]).toBeCloseTo((t.pess.valores[6] + 60000) * 1.02, 6);
  });

  it("a pessimista revista continua limitada a otimista − 0,5", () => {
    const t = projetarTunel(p([rev(2030, { rent_pess_pct: 5, rent_otim_pct: 5 })]));
    expect(t.pess.valores[7]).toBeCloseTo((t.pess.valores[6] + 60000) * 1.045, 6);
  });

  it("retirada revista antes do usufruto vale no início do usufruto", () => {
    const sem = projetar(p([]), 3);
    const com = projetar(p([rev(2030, { retirada_pct: 5 })]), 3);
    expect(sem.saqueAnual).toBeCloseTo(sem.valores[10] * 0.035, 6);
    expect(com.saqueAnual).toBeCloseTo(com.valores[10] * 0.05, 6);
  });

  it("retirada revista durante o usufruto recalcula a base sobre o patrimônio daquele ano", () => {
    const pr = p([rev(2036, { retirada_pct: 2 })]); // t = 12, dois anos depois do início do usufruto
    const r = projetar(pr, 3);
    const w0 = r.valores[10] * 0.035;
    expect(r.valores[11]).toBeCloseTo((r.valores[10] - w0) * 1.03, 6);
    expect(r.saqueAnual).toBeCloseTo(r.valores[12] * 0.02, 6);
    expect(r.valores[13]).toBeCloseTo((r.valores[12] - r.valores[12] * 0.02) * 1.03, 6);
  });

  it("anos das revisões no gráfico: só os que caem dentro do horizonte e depois do início", () => {
    expect(temposDasRevisoes(p([rev(2024), rev(2030), rev(2035), rev(2090)]))).toEqual([6, 11]);
  });

  it("descreverMudancas acusa mudança nas revisões", () => {
    expect(descreverMudancas(p([]), p([rev(2030, { aporte_mensal: 1 })]))).toContain("revisões");
    expect(descreverMudancas(p([rev(2030, { aporte_mensal: 1 })]), p([rev(2030, { aporte_mensal: 1 })]))).not.toContain("revisões");
  });
});

describe("revisão do último ano de aporte", () => {
  const rev = (ano: number, o: Partial<Revisao> = {}): Revisao => ({ ano, aporte_mensal: null, rent_pess_pct: null, rent_otim_pct: null, retirada_pct: null, fim_aporte: null, ...o });
  // início 2024, aporte por 10 anos (2024 a 2033), usufruto de 5 anos (2034 a 2038)
  const p = (revisoes: Revisao[]): Premissas => ({ ...base, anos_aporte: 10, perpetuo: false, anos_usufruto: 5, revisoes });

  it("anos de aporte efetivos: os das premissas, ou os da revisão", () => {
    expect(anosAporteEfetivo(p([]))).toBe(10);
    expect(anosAporteEfetivo(p([rev(2030, { fim_aporte: 2037 })]))).toBe(14);  // aporta até 2037
    expect(anosAporteEfetivo(p([rev(2030, { fim_aporte: 2029 })]))).toBe(6);   // para de aportar em 2030
  });

  it("prolongar o aporte adia o início do usufruto e alonga o horizonte", () => {
    const sem = projetar(p([]), 3);
    const com = projetar(p([rev(2030, { fim_aporte: 2037 })]), 3);
    expect(horizonte(p([rev(2030, { fim_aporte: 2037 })]))).toBe(19);
    expect(com.valores[11]).toBeGreaterThan(sem.valores[11]);           // em 2034 um segue aportando e o outro já saca
    expect(com.valores[11]).toBeCloseTo((com.valores[10] + 60000) * 1.03, 6); // ainda aportando em 2034
    expect(com.saqueAnual).toBeCloseTo(com.valores[14] * 0.035, 6);     // a retirada nasce em 2038 (t = 14)
  });

  it("encerrar o aporte antes antecipa o usufruto", () => {
    const com = projetar(p([rev(2030, { fim_aporte: 2029 })]), 3);
    expect(com.valores[7]).toBeCloseTo((com.valores[6] - com.saqueAnual) * 1.03, 6); // t = 6 (2030) já é usufruto
    expect(com.saqueAnual).toBeCloseTo(com.valores[6] * 0.035, 6);
  });

  it("revisão datada depois do início do usufruto das premissas: o aporte continua e o usufruto vem depois", () => {
    // premissas: aporte 2024 a 2033, usufruto de 2034; a revisão de 2036 manda aportar até 2037
    const pr = p([rev(2036, { fim_aporte: 2037, aporte_mensal: 9000 })]);
    expect(anosAporteEfetivo(pr)).toBe(14);
    const r = projetar(pr, 3);
    expect(r.valores[11]).toBeCloseTo((r.valores[10] + 5000 * 12) * 1.03, 6); // 2034: ainda aporta no valor base
    expect(r.valores[13]).toBeCloseTo((r.valores[12] + 9000 * 12) * 1.03, 6); // 2036 em diante: R$ 9.000
    expect(r.saqueAnual).toBeCloseTo(r.valores[14] * 0.035, 6);                // usufruto só em 2038
  });

  it("combina com revisão de aporte e de retirada", () => {
    const pr = p([rev(2030, { fim_aporte: 2037, aporte_mensal: 8000 }), rev(2040, { retirada_pct: 3 })]);
    const r = projetar(pr, 3);
    expect(r.valores[7]).toBeCloseTo((r.valores[6] + 8000 * 12) * 1.03, 6);
  });
});

describe("texto das revisões no cabeçalho do plano", () => {
  const rev = (ano: number, o: Partial<Revisao> = {}): Revisao => ({ ano, aporte_mensal: null, rent_pess_pct: null, rent_otim_pct: null, retirada_pct: null, fim_aporte: null, ...o });
  it("lista só o que a revisão muda, com o ano", () => {
    expect(descreverRevisao(rev(2030, { aporte_mensal: 8000 }))).toBe("2030: aporte R$ 8.000");
    expect(descreverRevisao(rev(2038, { fim_aporte: 2045, retirada_pct: 3 }))).toBe("2038: aportes até 2045, retirada 3%");
    expect(descreverRevisao(rev(2040, { rent_pess_pct: 2.5, rent_otim_pct: 5 }))).toBe("2040: rentabilidade 2,5% a 5%");
    expect(descreverRevisao(rev(2041, { rent_otim_pct: 5 }))).toBe("2041: rentabilidade — a 5%");
  });
});

describe("planejado x real: o que o plano previa por ano", () => {
  const rev = (ano: number, o: Partial<Revisao> = {}): Revisao => ({ ano, aporte_mensal: null, rent_pess_pct: null, rent_otim_pct: null, retirada_pct: null, fim_aporte: null, ...o });
  const p: Premissas = { ...base, ano_inicio: 2024, patrimonio_inicial: 10000, aporte_mensal: 1000, anos_aporte: 3, perpetuo: false, anos_usufruto: 2, revisoes: [] };

  it("investido planejado = patrimônio inicial + aportes (parado depois do último ano de aporte)", () => {
    expect(investidoPlanejado(p)).toEqual([10000, 22000, 34000, 46000, 46000, 46000]);
  });
  it("revisão de aporte muda o investido planejado a partir do ano", () => {
    expect(investidoPlanejado({ ...p, revisoes: [rev(2026, { aporte_mensal: 2000 })] })).toEqual([10000, 22000, 34000, 58000, 58000, 58000]);
  });
  it("as retiradas do usufruto abatem o investido planejado (sem ficar negativo)", () => {
    const t = projetarTunel(p);
    const inv = investidoPlanejado(p, t.pess.saques);
    expect(inv[3]).toBeCloseTo(46000, 6); // os aportes acabam em t = 3, o saque do ano 3 só aparece em inv[4]
    expect(inv[4]).toBeCloseTo(Math.max(0, 46000 - t.pess.saques[3]), 6);
    expect(inv.every((x) => x >= 0)).toBe(true);
    expect(inv[4]).toBeLessThan(46000);
  });
  it("barras planejadas: ano encerrado usa o início do ano seguinte; ano corrente usa hoje; antes do plano é null", () => {
    const t = projetarTunel(p);
    const fatores = [1, 1, 1, 1, 1, 1];
    const r = barrasPlanejadas(p, t.pess.valores, t.otim.valores, fatores, [2023, 2024, 2025], 2025, 1.5);
    expect(r[0]).toBeNull();
    expect(r[1]?.investido).toBeCloseTo(22000, 6);              // fim de 2024 = início de 2025 (t = 1)
    expect(r[1]?.pess).toBeCloseTo(t.pess.valores[1], 6);
    expect(r[2]?.investido).toBeCloseTo((22000 + 34000) / 2, 6); // ano corrente: t = 1,5 entre 2025 e 2026
    expect(r[2]!.otim).toBeGreaterThan(r[2]!.pess);
  });
  it("ano futuro usa o fim daquele ano (não o dia de hoje)", () => {
    const t = projetarTunel(p);
    const r = barrasPlanejadas(p, t.pess.valores, t.otim.valores, [1, 1, 1, 1, 1, 1], [2027], 2025, 1.5);
    expect(r[0]?.investido).toBeCloseTo(46000, 6); // fim de 2027 = início de 2028 (t = 4): aportes acabaram em 2026
    expect(r[0]?.pess).toBeCloseTo(t.pess.valores[4], 6);
  });
  it("corrige o planejado pela inflação acumulada (reais correntes)", () => {
    const t = projetarTunel(p);
    const r = barrasPlanejadas(p, t.pess.valores, t.otim.valores, [1, 1.1, 1.2, 1.3, 1.4, 1.5], [2024], 2030, 0);
    expect(r[0]?.investido).toBeCloseTo(22000 * 1.1, 6);
  });
});

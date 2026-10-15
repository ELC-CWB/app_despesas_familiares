import { describe, expect, it } from "vitest";
import {
  avaliarGuardrails, coberturaColchao, corrigirPorAniversarios, escolherAtivoSaque, ipca12Meses, picoCorrigido,
  retiradaVigente, saqueInicial, saqueMensalAtual, ultimaRevisao,
  type AtivoSaque, type Retirada, type RegrasGuardrails,
} from "@/lib/carteira/usufruto";
import type { IpcaMes } from "@/lib/carteira/plano";

// IPCA de 1% ao mês, de 2026-01 a 2028-12
const ipca: IpcaMes[] = Array.from({ length: 36 }, (_, i) => ({
  competencia: `${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`, variacao_pct: 1,
}));
const f12 = 1.01 ** 12;

const regras: RegrasGuardrails = { protecao_on: true, queda_pct: 20, corte_pct: 10, aumento_on: true, gatilho_pct: 3, aumento_pct: 10 };
const ret = (o: Partial<Retirada> & Pick<Retirada, "vigente_desde" | "valor_mensal">): Retirada => ({
  id: o.vigente_desde, valor_anterior: null, motivo: "inicial", decisao: null, ...o,
});

describe("correção pelo IPCA (REGRAS §3)", () => {
  it("IPCA dos 12 meses anteriores ao aniversário", () => {
    expect(ipca12Meses(ipca, "2027-01-01")).toBeCloseTo(f12, 10);
    expect(ipca12Meses(ipca, "2026-07-01")).toBeCloseTo(1.01 ** 6, 10); // só 6 meses de dados
  });

  it("corrige a cada aniversário do início; antes dele o valor não muda", () => {
    expect(corrigirPorAniversarios(1000, "2026-01-01", "2026-01-01", "2026-12-31", ipca)).toBe(1000);
    expect(corrigirPorAniversarios(1000, "2026-01-01", "2026-01-01", "2027-01-01", ipca)).toBeCloseTo(1000 * f12, 6);
    expect(corrigirPorAniversarios(1000, "2026-01-01", "2026-01-01", "2028-06-01", ipca)).toBeCloseTo(1000 * f12 * f12, 6);
  });

  it("uma retirada nova (a partir de meio do ano) só é corrigida no próximo aniversário", () => {
    expect(corrigirPorAniversarios(900, "2026-08-10", "2026-01-01", "2026-12-31", ipca)).toBe(900);
    expect(corrigirPorAniversarios(900, "2026-08-10", "2026-01-01", "2027-02-01", ipca)).toBeCloseTo(900 * f12, 6);
  });

  it("saque inicial = patrimônio × retirada% ÷ 12", () => {
    expect(saqueInicial(1_200_000, 3.5)).toBeCloseTo(3500, 6);
  });

  it("a retirada recusada não muda o valor em vigor", () => {
    const r = [ret({ vigente_desde: "2026-01-01", valor_mensal: 4000 }),
      ret({ vigente_desde: "2026-03-01", valor_mensal: 3600, motivo: "protecao", decisao: "recusado" })];
    expect(retiradaVigente(r)?.valor_mensal).toBe(4000);
    expect(saqueMensalAtual(r, "2026-01-01", "2026-06-01", ipca)).toBe(4000);
  });
});

describe("ativo a vender no saque (REGRAS §3)", () => {
  const A = (id: string, mercado: "brasil" | "exterior", alvo: number): AtivoSaque => ({ id, codigo: id, mercado, alvo_pct: alvo, banda_pp: 5 });
  const ativos = [A("acoesBR", "brasil", 30), A("globais", "exterior", 40), A("lfts", "brasil", 30)];

  it("1) o ativo do Brasil com maior excesso, mesmo que haja ativo do exterior com mais excesso", () => {
    // total 1000: acoesBR 350 (+50), globais 450 (+50), lfts 200 (−100)
    const e = escolherAtivoSaque(ativos, { acoesBR: 350, globais: 450, lfts: 200 }, 10, "lfts");
    expect(e.ativo?.id).toBe("acoesBR");
    expect(e.motivo).toBe("brasil");
    expect(e.excesso).toBeCloseTo(50, 6);
    expect(e.fica_abaixo).toBe(false);
  });

  it("avisa quando o saque é maior que o excesso", () => {
    const e = escolherAtivoSaque(ativos, { acoesBR: 350, globais: 450, lfts: 200 }, 80, "lfts");
    expect(e.fica_abaixo).toBe(true);
  });

  it("2) sem ativo do Brasil acima do alvo, o do exterior", () => {
    const e = escolherAtivoSaque(ativos, { acoesBR: 250, globais: 500, lfts: 250 }, 10, "lfts");
    expect(e.ativo?.id).toBe("globais");
    expect(e.motivo).toBe("exterior");
  });

  it("o colchão não é escolhido como 'ativo acima do alvo'", () => {
    const e = escolherAtivoSaque(ativos, { acoesBR: 200, globais: 300, lfts: 500 }, 10, "lfts");
    expect(e.motivo).toBe("colchao");
    expect(e.ativo?.id).toBe("lfts");
  });

  it("3) ninguém acima do alvo: colchão, para não vender ações em queda", () => {
    const e = escolherAtivoSaque(ativos, { acoesBR: 300, globais: 400, lfts: 300 }, 10, "lfts");
    expect(e.motivo).toBe("colchao");
  });

  it("4) sem colchão definido: o ativo mais perto do alvo", () => {
    const e = escolherAtivoSaque(ativos, { acoesBR: 290, globais: 400, lfts: 310 }, 10, null);
    // acoesBR e lfts estão a 10 do alvo; lfts está acima (+10) e é do Brasil, então vence pela regra 1
    expect(e.ativo?.id).toBe("lfts");
    const e2 = escolherAtivoSaque(ativos, { acoesBR: 300, globais: 400, lfts: 300 }, 10, null);
    expect(e2.motivo).toBe("mais_perto");
  });

  it("sem patrimônio não há ativo", () => {
    expect(escolherAtivoSaque(ativos, {}, 10, "lfts").motivo).toBe("sem_ativo");
  });
});

describe("cobertura do colchão", () => {
  it("floor(colchão / saque mensal)", () => {
    expect(coberturaColchao(150_000, 4000)).toBe(37);
    expect(coberturaColchao(48_000, 4000)).toBe(12);
    expect(coberturaColchao(10_000, 0)).toBeNull();
  });
});

describe("pico", () => {
  it("corrige cada ponto pelo IPCA até hoje e usa o patrimônio de hoje se for maior", () => {
    const pontos = [{ data: "2026-01-15", patrimonio: 1000 }, { data: "2025-12-01", patrimonio: 5000 }];
    // o ponto de 2025 é anterior ao início do usufruto e não conta
    const pico = picoCorrigido(pontos, "2026-01-01", "2026-07-01", 900, ipca);
    expect(pico).toBeCloseTo(1000 * 1.01 ** 6, 6);
    expect(picoCorrigido(pontos, "2026-01-01", "2026-07-01", 2000, ipca)).toBe(2000);
  });
});

describe("guardrails (REGRAS §4)", () => {
  const inicio = "2026-01-01";
  const base = (over: Partial<Parameters<typeof avaliarGuardrails>[0]> = {}) => ({
    regras, hoje: "2026-06-01", inicio, ipca, patrimonio: 1_000_000, pico: 1_000_000, pontos: [],
    retiradas: [ret({ vigente_desde: inicio, valor_mensal: 3500 })], ...over,
  });

  it("sem queda e sem revisão anual: nada a sugerir", () => {
    expect(avaliarGuardrails(base())).toBeNull();
  });

  it("proteção: queda acima de 20% reduz a retirada em 10%", () => {
    const a = avaliarGuardrails(base({ patrimonio: 750_000 }));
    expect(a?.tipo).toBe("protecao");
    if (a?.tipo === "protecao") {
      expect(a.queda_pct).toBeCloseTo(25, 6);
      expect(a.valor_anterior).toBe(3500);
      expect(a.novo_valor).toBeCloseTo(3150, 6);
    }
  });

  it("queda de exatamente 20% não dispara (o gatilho é > 20%)", () => {
    expect(avaliarGuardrails(base({ patrimonio: 800_000 }))).toBeNull();
  });

  it("proteção desligada não sugere", () => {
    expect(avaliarGuardrails(base({ patrimonio: 700_000, regras: { ...regras, protecao_on: false } }))).toBeNull();
  });

  it("proteção recusada não volta enquanto a situação não mudar", () => {
    const retiradas = [
      ret({ vigente_desde: inicio, valor_mensal: 3500 }),
      ret({ vigente_desde: "2026-04-01", valor_mensal: 3150, valor_anterior: 3500, motivo: "protecao", decisao: "recusado" }),
    ];
    const ainda = [{ data: "2026-05-01", patrimonio: 760_000 }];
    expect(avaliarGuardrails(base({ patrimonio: 750_000, retiradas, pontos: ainda }))).toBeNull();
    // recuperou (queda ≤ 20%) depois da recusa e caiu de novo: a sugestão volta
    const recuperou = [{ data: "2026-05-01", patrimonio: 900_000 }];
    expect(avaliarGuardrails(base({ patrimonio: 750_000, retiradas, pontos: recuperou }))?.tipo).toBe("protecao");
  });

  it("com a proteção em curso não sugere aumento nem nova proteção; ao recuperar o pico, volta ao valor anterior", () => {
    const retiradas = [
      ret({ vigente_desde: inicio, valor_mensal: 3500 }),
      ret({ vigente_desde: "2026-04-01", valor_mensal: 3150, valor_anterior: 3500, motivo: "protecao", decisao: "aceito" }),
    ];
    expect(avaliarGuardrails(base({ retiradas, patrimonio: 700_000 }))).toBeNull();
    const volta = avaliarGuardrails(base({ retiradas, patrimonio: 1_000_000 }));
    expect(volta?.tipo).toBe("retorno_pico");
    if (volta?.tipo === "retorno_pico") expect(volta.novo_valor).toBeCloseTo(3500, 6);
  });

  it("o retorno ao valor anterior mantém a correção do IPCA já aplicada", () => {
    const retiradas = [
      ret({ vigente_desde: inicio, valor_mensal: 3500 }),
      ret({ vigente_desde: "2026-04-01", valor_mensal: 3150, valor_anterior: 3500, motivo: "protecao", decisao: "aceito" }),
    ];
    const volta = avaliarGuardrails(base({ retiradas, patrimonio: 1_100_000, pico: 1_100_000, hoje: "2027-02-01" }));
    expect(volta?.tipo).toBe("retorno_pico");
    if (volta?.tipo === "retorno_pico") expect(volta.novo_valor).toBeCloseTo(3500 * f12, 4);
  });

  it("aumento: na revisão anual, retirada anual / saldo < 3% sugere +10%", () => {
    // depois do 1º aniversário o saque foi corrigido pelo IPCA
    const a = avaliarGuardrails(base({ hoje: "2027-02-01", patrimonio: 1_800_000, pico: 1_800_000 }));
    expect(a?.tipo).toBe("aumento");
    if (a?.tipo === "aumento") {
      const atual = 3500 * f12;
      expect(a.retirada_pct).toBeCloseTo(((atual * 12) / 1_800_000) * 100, 6);
      expect(a.novo_valor).toBeCloseTo(atual * 1.1, 6);
    }
  });

  it("aumento não é avaliado antes da primeira revisão nem quando a retirada está acima do gatilho", () => {
    expect(avaliarGuardrails(base({ patrimonio: 5_000_000, pico: 5_000_000 }))).toBeNull();
    expect(avaliarGuardrails(base({ hoje: "2027-02-01", patrimonio: 1_000_000, pico: 1_000_000 }))).toBeNull();
  });

  it("aumento decidido (aceito ou recusado) nesta revisão não repete; volta na revisão seguinte", () => {
    const decidiu = [ret({ vigente_desde: inicio, valor_mensal: 3500 }),
      ret({ vigente_desde: "2027-02-10", valor_mensal: 3500 * f12 * 1.1, motivo: "aumento", decisao: "recusado" })];
    const e = base({ hoje: "2027-03-01", patrimonio: 2_500_000, pico: 2_500_000, retiradas: decidiu });
    expect(avaliarGuardrails(e)).toBeNull();
    expect(avaliarGuardrails({ ...e, hoje: "2028-02-01" })?.tipo).toBe("aumento");
  });

  it("a proteção tem prioridade sobre o aumento", () => {
    const a = avaliarGuardrails(base({ hoje: "2027-02-01", patrimonio: 700_000, pico: 1_000_000 }));
    expect(a?.tipo).toBe("protecao");
  });

  it("última revisão = último aniversário do início já passado", () => {
    expect(ultimaRevisao("2026-03-15", "2026-12-01")).toBeNull();
    expect(ultimaRevisao("2026-03-15", "2028-03-15")).toBe("2028-03-15");
  });
});

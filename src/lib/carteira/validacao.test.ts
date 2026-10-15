import { describe, expect, it } from "vitest";
import { CORRETORA_PADRAO } from "@/lib/carteira/constantes";
import type { Ativo, Estrutura, OnboardingEntrada } from "@/lib/carteira/tipos";
import { validarEstrutura, validarOnboarding, validarPlano } from "@/lib/carteira/validacao";

function ativo(id: string, codigo: string, bloco_id: string, alvo_pct: number): Ativo {
  return {
    id, codigo, ticker_cotacao: null, tipo: "etf_acoes", mercado: "brasil", moeda: "BRL", bloco_id,
    corretora_id: "c1", gestora: null, alvo_pct, banda_pp: null, taxa_adm_pct: 0, aliquota_ir_pct: null, sede: null, ordem: 0,
  };
}

function estrutura(): Estrutura {
  return {
    corretoras: [{ id: "c1", nome: "Banco Inter", mercado: "ambos", ...CORRETORA_PADRAO }],
    geografias: [{ id: "g1", nome: "Brasil", cor: "verde", ordem: 0 }],
    blocos: [
      { id: "b1", geografia_id: "g1", nome: "Ações Brasil", nome_curto: null, banda_pp: null, ordem: 0 },
      { id: "b2", geografia_id: "g1", nome: "Renda fixa", nome_curto: null, banda_pp: 5, ordem: 1 },
    ],
    ativos: [ativo("a1", "QLBR11", "b1", 60), ativo("a2", "LFTS11", "b2", 40)],
    config: { colchao_ativo_id: "a2", colchao_min_meses: 12, aliquotas: { etf_acoes: 15 } },
  };
}

const plano = {
  ano_inicio: 2026, patrimonio_inicial: 0, aporte_mensal: 3000, anos_aporte: 20, perpetuo: true,
  anos_usufruto: null, retirada_pct: 3.5, rent_pess_pct: 3, rent_otim_pct: 6,
};

describe("validarEstrutura", () => {
  it("aceita uma estrutura completa", () => {
    expect(validarEstrutura(estrutura())).toBeNull();
  });

  it("aceita estrutura parcial: listas vazias e soma diferente de 100%", () => {
    const e = estrutura();
    e.ativos[1].alvo_pct = 30;
    expect(validarEstrutura(e)).toBeNull();
    expect(validarEstrutura({
      corretoras: [], geografias: [], blocos: [], ativos: [],
      config: { colchao_ativo_id: null, colchao_min_meses: 12, aliquotas: {} },
    })).toBeNull();
  });

  it("recusa código repetido", () => {
    const e = estrutura();
    e.ativos[1].codigo = "qlbr11";
    expect(validarEstrutura(e)).toBe("O código QLBR11 aparece mais de uma vez.");
  });

  it("recusa bloco sem geografia válida e banda negativa", () => {
    const e = estrutura();
    e.blocos[0].geografia_id = "x";
    expect(validarEstrutura(e)).toBe("Escolha a geografia de todos os blocos.");
    const e2 = estrutura();
    e2.blocos[1].banda_pp = -1;
    expect(validarEstrutura(e2)).toBe("A banda dos blocos não pode ser negativa.");
  });

  it("recusa colchão que não é um dos ativos", () => {
    const e = estrutura();
    e.config.colchao_ativo_id = "zz";
    expect(validarEstrutura(e)).toBe("O ativo escolhido como colchão não está na lista de ativos.");
  });

  it("aceita bloco vazio em Configurações", () => {
    const e = estrutura();
    e.blocos.push({ id: "b3", geografia_id: "g1", nome: "Novo bloco", nome_curto: null, banda_pp: null, ordem: 2 });
    expect(validarEstrutura(e)).toBeNull();
  });
});

describe("validarPlano", () => {
  it("exige pessimista menor que otimista", () => {
    expect(validarPlano({ ...plano, rent_pess_pct: 6 })).toBe("A rentabilidade pessimista precisa ser menor que a otimista.");
  });

  it("com prazo exige anos de usufruto", () => {
    expect(validarPlano({ ...plano, perpetuo: false })).toBe("Informe os anos de usufruto.");
    expect(validarPlano({ ...plano, perpetuo: false, anos_usufruto: 30 })).toBeNull();
  });
});

describe("validarOnboarding", () => {
  const base = (): OnboardingEntrada => ({ estrutura: estrutura(), plano, posicoes: [] });

  it("exige estratégia completa com soma = 100%", () => {
    const o = base();
    o.estrutura.ativos[1].alvo_pct = 30;
    expect(validarOnboarding(o)).toBe("A soma dos alvos precisa ser 100% (hoje está em 90,0%).");
    const o2 = base();
    o2.estrutura.ativos = [];
    expect(validarOnboarding(o2)).toBe("Cadastre pelo menos um ativo.");
  });

  it("recusa bloco sem ativos", () => {
    const o = base();
    o.estrutura.blocos.push({ id: "b3", geografia_id: "g1", nome: "Alternativos", nome_curto: null, banda_pp: null, ordem: 2 });
    expect(validarOnboarding(o)).toBe(
      "O bloco Alternativos não tem ativos. Adicione ativos a ele ou volte e remova o bloco.",
    );
  });

  it("valida as posições informadas", () => {
    const o = base();
    o.posicoes = [{ ativo_id: "a1", quantidade: 10, preco_medio: 100, custo_total_brl: 1000 }];
    expect(validarOnboarding(o)).toBeNull();
    o.posicoes[0].quantidade = 0;
    expect(validarOnboarding(o)).toBe("Nas posições, quantidade, preço médio e custo precisam ser maiores que zero.");
  });
});

describe("validação das revisões do plano", () => {
  const plano = {
    ano_inicio: 2026, patrimonio_inicial: 100000, aporte_mensal: 3000, anos_aporte: 20, perpetuo: false, anos_usufruto: 30,
    retirada_pct: 3.5, rent_pess_pct: 3, rent_otim_pct: 6,
  };
  const rev = (ano: number, o: object = {}) => ({ ano, aporte_mensal: null, rent_pess_pct: null, rent_otim_pct: null, retirada_pct: null, fim_aporte: null, ...o });
  const v = (revisoes: ReturnType<typeof rev>[]) => validarPlano({ ...plano, id: "x", versao: 1, em_uso: true, revisoes } as never);

  it("aceita revisões válidas e plano sem revisões", () => {
    expect(v([])).toBeNull();
    expect(v([rev(2038, { aporte_mensal: 8000 }), rev(2050, { rent_otim_pct: 5, retirada_pct: 3 })])).toBeNull();
  });
  it("ano precisa estar depois do início e dentro do plano, sem repetir", () => {
    expect(v([rev(2026, { aporte_mensal: 1 })])).toMatch(/entre 2027 e 2076/);
    expect(v([rev(2077, { aporte_mensal: 1 })])).toMatch(/entre 2027 e 2076/);
    expect(v([rev(2038, { aporte_mensal: 1 }), rev(2038, { aporte_mensal: 2 })])).toMatch(/duas revisões para 2038/);
  });
  it("exige ao menos um campo e valores válidos", () => {
    expect(v([rev(2038)])).toMatch(/não altera nada/);
    expect(v([rev(2038, { aporte_mensal: -1 })])).toMatch(/negativo/);
    expect(v([rev(2038, { retirada_pct: 0 })])).toMatch(/maior que zero/);
  });
  it("a pessimista revista precisa continuar abaixo da otimista em vigor", () => {
    expect(v([rev(2038, { rent_pess_pct: 7 })])).toMatch(/pessimista precisa ser menor/);
    expect(v([rev(2038, { rent_otim_pct: 2 })])).toMatch(/pessimista precisa ser menor/);
    expect(v([rev(2038, { rent_pess_pct: 7 }), rev(2040, { rent_otim_pct: 9 })])).toMatch(/2038/); // erro já na primeira
  });
});

describe("validação da revisão do último ano de aporte", () => {
  const plano = {
    ano_inicio: 2026, patrimonio_inicial: 100000, aporte_mensal: 3000, anos_aporte: 15, perpetuo: false, anos_usufruto: 30,
    retirada_pct: 3.5, rent_pess_pct: 3, rent_otim_pct: 6,
  }; // aporta de 2026 a 2040; usufruto de 2041 a 2070
  const rev = (ano: number, o: object = {}) => ({ ano, aporte_mensal: null, rent_pess_pct: null, rent_otim_pct: null, retirada_pct: null, fim_aporte: null, ...o });
  const v = (revisoes: ReturnType<typeof rev>[]) => validarPlano({ ...plano, id: "x", versao: 1, em_uso: true, revisoes } as never);

  it("aceita prolongar ou encurtar o aporte durante a acumulação", () => {
    expect(v([rev(2035, { fim_aporte: 2045 })])).toBeNull();
    expect(v([rev(2035, { fim_aporte: 2034 })])).toBeNull(); // para de aportar a partir de 2035
  });
  it("não deixa o último ano de aporte ser anterior ao ano da revisão menos um", () => {
    expect(v([rev(2035, { fim_aporte: 2030 })])).toMatch(/não pode ser anterior a 2034/);
  });
  it("aceita prolongar o aporte numa revisão datada depois do início do usufruto das premissas", () => {
    // premissas: aporte até 2040 (usufruto em 2041); revisão em 2042 passa o aporte para 2046 e o usufruto para 2047
    expect(v([rev(2042, { fim_aporte: 2046, aporte_mensal: 9000 })])).toBeNull();
    expect(v([rev(2045, { fim_aporte: 2050 })])).toBeNull();
  });
  it("a revisão com só o último ano de aporte já conta como alteração", () => {
    expect(v([rev(2035, { fim_aporte: 2040 })])).toBeNull();
  });
  it("revisões depois do fim do plano encurtado são recusadas", () => {
    // aporte até 2030 → o plano vai de 2026 a 2061; uma revisão em 2068 ficaria fora
    expect(v([rev(2030, { fim_aporte: 2030 }), rev(2068, { aporte_mensal: 1 })])).toMatch(/entre 2027 e 2061/);
    // e uma revisão que já existia em 2050 fica depois do novo fim
    expect(v([rev(2030, { fim_aporte: 2030 }), rev(2062, { aporte_mensal: 1 })])).toMatch(/entre 2027 e 2061/);
  });
});

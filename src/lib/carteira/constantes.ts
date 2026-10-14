// Constantes da Carteira (docs/carteira/SPEC.md e protótipos em docs/carteira/prototipo/).
// Nada aqui é recomendação de ativo: só listas de opções e valores padrão editáveis.

export const TIPOS_ATIVO = [
  { id: "acao", nome: "Ação", nota: "Vendas de até R$ 20 mil no mês são isentas; acima disso, 15% sobre o ganho." },
  { id: "etf_acoes", nome: "ETF de ações", nota: "Toda venda com ganho é tributada; ETFs não têm a isenção de R$ 20 mil mensais das ações." },
  { id: "etf_rf", nome: "ETF de renda fixa", nota: "Alíquota depende do prazo médio da carteira do ETF; 15% para os de prazo longo." },
  { id: "etf_outros", nome: "ETF de ouro, cripto ou outros", nota: "Tributados como ETFs de renda variável na B3." },
  { id: "fii", nome: "Fundo imobiliário (FII)", nota: "Ganho na venda tributado a 20%; rendimentos mensais em regra isentos para pessoa física." },
  { id: "bdr", nome: "BDR", nota: "Ganho na venda tributado como renda variável, sem isenção mensal." },
  { id: "tesouro", nome: "Título público (Tesouro)", nota: "Tabela regressiva de 22,5% a 15% conforme o prazo; use a alíquota esperada no resgate." },
  { id: "cdb", nome: "CDB, LC ou RDB", nota: "Tabela regressiva de 22,5% a 15% conforme o prazo." },
  { id: "lci", nome: "LCI, LCA, CRI ou CRA", nota: "Isentos de IR para pessoa física." },
  { id: "debenture", nome: "Debênture", nota: "Comuns seguem a tabela regressiva; incentivadas são isentas." },
  { id: "fundo", nome: "Fundo de investimento", nota: "Depende da classe do fundo; pode haver come-cotas." },
  { id: "cripto", nome: "Criptoativo (direto)", nota: "Regras próprias; confira a legislação vigente." },
] as const;

export type TipoAtivo = typeof TIPOS_ATIVO[number]["id"];
export const TIPO_IDS = TIPOS_ATIVO.map((t) => t.id) as TipoAtivo[];
export const TIPO_NOME: Record<TipoAtivo, string> = Object.fromEntries(TIPOS_ATIVO.map((t) => [t.id, t.nome])) as Record<TipoAtivo, string>;

// Chave extra das alíquotas: qualquer ativo no exterior (Lei 14.754/2023)
export const ALIQUOTA_EXTERIOR = {
  id: "exterior",
  nome: "Qualquer ativo no exterior",
  nota: "Ganho apurado em reais, incluindo a variação cambial; declarado no ajuste anual (Lei 14.754/2023).",
} as const;

export type ChaveAliquota = TipoAtivo | "exterior";

export const ALIQUOTAS_PADRAO: Record<ChaveAliquota, number> = {
  acao: 15, etf_acoes: 15, etf_rf: 15, etf_outros: 15, fii: 20, bdr: 15,
  tesouro: 15, cdb: 15, lci: 0, debenture: 15, fundo: 15, cripto: 15, exterior: 15,
};

export const PALETA = [
  { id: "azul", nome: "Azul", hex: "#8EB6E3" },
  { id: "verde", nome: "Verde", hex: "#8DCB9F" },
  { id: "laranja", nome: "Laranja", hex: "#F2B880" },
  { id: "roxo", nome: "Roxo", hex: "#C3A8E0" },
  { id: "rosa", nome: "Rosa", hex: "#EBA6B9" },
  { id: "turquesa", nome: "Turquesa", hex: "#85CFCB" },
  { id: "amarelo", nome: "Amarelo", hex: "#E8D27A" },
  { id: "cinza", nome: "Cinza", hex: "#A9B8C6" },
] as const;

// Tom escuro de cada cor, para textos sobre o pastel (gráfico e tabela Real x planejado)
export const COR_TINTA = {
  azul: "#1A4A82", verde: "#1C6436", laranja: "#8A4B0F", roxo: "#4E2C7A",
  rosa: "#8A2846", turquesa: "#145C58", amarelo: "#6B5500", cinza: "#33414F",
} as const;

export type CorPaleta = typeof PALETA[number]["id"];
export const COR_IDS = PALETA.map((c) => c.id) as CorPaleta[];
export const COR_HEX: Record<CorPaleta, string> = Object.fromEntries(PALETA.map((c) => [c.id, c.hex])) as Record<CorPaleta, string>;

export type Mercado = "brasil" | "exterior";
export const MERCADO_NOME: Record<Mercado, string> = { brasil: "Brasil", exterior: "Exterior" };

export type MercadoCorretora = Mercado | "ambos";
export const MERCADO_CORRETORA_NOME: Record<MercadoCorretora, string> = {
  brasil: "Brasil (B3)", exterior: "Exterior", ambos: "Brasil e exterior",
};

export const MOEDAS = ["BRL", "USD", "EUR"] as const;
export type Moeda = typeof MOEDAS[number];

// Padrão Banco Inter (REGRAS.md §5). Percentuais em pontos: 1.25 = 1,25%.
export const CORRETORA_PADRAO = {
  corr_br_pct: 0, corr_br_min: 0, corr_ext_pct: 0.2, corr_ext_min_usd: 2,
  emolumentos_pct: 0.03, custodia_pct: 0, spread_pct: 1.25, iof_ida_pct: 1.1, iof_volta_pct: 0.38,
};

// Regras de ajuste da retirada (REGRAS.md §4) — padrões
export const REGRAS_RETIRADA_PADRAO = {
  regra_protecao_on: true, regra_queda_pct: 20, regra_corte_pct: 10,
  regra_aumento_on: true, regra_gatilho_pct: 3, regra_aumento_pct: 10,
};

export const COLCHAO_MIN_MESES_PADRAO = 12;

// Modelo de exemplo do onboarding: só geografias e blocos genéricos, sem ativos (SPEC §2)
export const MODELO_EXEMPLO = {
  geografias: [
    { chave: "g1", nome: "Global", cor: "azul" as CorPaleta },
    { chave: "g2", nome: "Brasil", cor: "verde" as CorPaleta },
  ],
  blocos: [
    { nome: "Ações globais", geografia: "g1" },
    { nome: "Alternativos", geografia: "g1" },
    { nome: "Ações Brasil", geografia: "g2" },
    { nome: "Renda fixa", geografia: "g2" },
  ],
};

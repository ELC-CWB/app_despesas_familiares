// Ficha do ativo (popup da Visão geral). Funções puras + busca no Yahoo Finance + ficha curada.
// Resultado do teste do Yahoo (quoteSummary): ETFs de Londres devolvem nome, gestora (family) e patrimônio do fundo,
// mas sem texto descritivo; ETFs da B3 devolvem só o nome; ações trazem assetProfile (descrição, setor, site).
// Por isso: ação → Yahoo (assetProfile); ETFs e renda fixa → ficha curada (CATALOGO) + dados vivos do Yahoo.

import { TIPO_NOME, type TipoAtivo } from "@/lib/carteira/constantes";
import { getYahooAuth, YF_UA } from "@/lib/market/yahoo";

export type Destaque = { rotulo: string; valor: string };
export type FonteInfo = { nome: string; url: string };
export type AtivoInfo = {
  codigo: string;
  nome: string;
  tipo: TipoAtivo;
  tipoNome: string;
  descricao: string | null;        // null = sem descrição disponível (a tela mostra o aviso amigável)
  idiomaOriginal: boolean;         // descrição vinda em inglês (Yahoo), sem tradução
  destaques: Destaque[];
  fontes: FonteInfo[];
  atualizadoEm: string;
};

export type EntradaCatalogo = {
  descricao: string;
  indice?: string;
  classe: string;                  // o que é, em poucas palavras
  risco?: string;
  fontes: FonteInfo[];
};

const YAHOO = (t: string): FonteInfo => ({ nome: "Yahoo Finance", url: `https://finance.yahoo.com/quote/${encodeURIComponent(t)}` });

// Fichas resumidas (texto do app, em português). Servem de ponto de partida: o índice e a gestora são
// conferíveis no site da gestora indicado em "Fontes". Chave: código do ativo na carteira.
export const CATALOGO: Record<string, EntradaCatalogo> = {
  VALU: {
    classe: "ETF de ações globais (UCITS, Irlanda)",
    indice: "FTSE Global All Cap",
    descricao: "ETF da Vanguard listado em Londres que investe em milhares de ações de empresas de todos os tamanhos, em países desenvolvidos e emergentes. Funciona como uma carteira global diversificada em um único papel; a versão “Acc” reinveste os dividendos automaticamente.",
    risco: "Renda variável: oscila com as bolsas do mundo e com o dólar em relação ao real.",
    fontes: [{ nome: "Vanguard", url: "https://www.vanguard.co.uk" }],
  },
  IWVL: {
    classe: "ETF de ações globais, fator valor (UCITS, Irlanda)",
    indice: "MSCI World Enhanced Value",
    descricao: "ETF da iShares (BlackRock) que investe em ações de países desenvolvidos com preço baixo em relação aos fundamentos (como lucro e valor patrimonial), a chamada estratégia de valor. A versão “Acc” reinveste os dividendos.",
    risco: "Renda variável: oscila com as bolsas e o dólar; o fator valor pode ficar anos atrás do mercado.",
    fontes: [{ nome: "iShares (BlackRock)", url: "https://www.ishares.com" }],
  },
  IWQU: {
    classe: "ETF de ações globais, fator qualidade (UCITS, Irlanda)",
    indice: "MSCI World Sector Neutral Quality",
    descricao: "ETF da iShares (BlackRock) que seleciona, em países desenvolvidos, empresas de alta qualidade: alta rentabilidade sobre o patrimônio, pouca dívida e lucros estáveis. A versão “Acc” reinveste os dividendos.",
    risco: "Renda variável: oscila com as bolsas e o dólar.",
    fontes: [{ nome: "iShares (BlackRock)", url: "https://www.ishares.com" }],
  },
  IWMO: {
    classe: "ETF de ações globais, fator momento (UCITS, Irlanda)",
    indice: "MSCI World Momentum",
    descricao: "ETF da iShares (BlackRock) que se concentra em ações de países desenvolvidos que tiveram a melhor alta recente, a estratégia de momento. A carteira é renovada periodicamente. A versão “Acc” reinveste os dividendos.",
    risco: "Renda variável: oscila com as bolsas e o dólar; costuma cair mais forte em reversões de mercado.",
    fontes: [{ nome: "iShares (BlackRock)", url: "https://www.ishares.com" }],
  },
  GOLD11: {
    classe: "ETF de ouro (B3)",
    indice: "LBMA Gold Price (preço do ouro em dólar)",
    descricao: "ETF negociado na B3 que busca acompanhar o preço do ouro no mercado internacional, com exposição ao dólar. Permite ter ouro em reais, pela corretora, sem guardar o metal.",
    risco: "Sem renda periódica; o preço oscila com o ouro e o dólar.",
    fontes: [{ nome: "B3 – ETFs", url: "https://www.b3.com.br/pt_br/produtos-e-servicos/negociacao/renda-variavel/etf/" }],
  },
  HODL11: {
    classe: "ETF de bitcoin (B3)",
    indice: "MarketVector Bitcoin Benchmark Rate",
    descricao: "ETF da Investo negociado na B3 que busca acompanhar o preço do bitcoin, sem precisar de carteira de criptomoedas. Replica um índice de referência do preço da moeda.",
    risco: "Muito volátil: pode oscilar dezenas de por cento em pouco tempo.",
    fontes: [{ nome: "Investo", url: "https://investo.com.br" }],
  },
  QLBR11: {
    classe: "ETF de ações brasileiras, fator qualidade (B3)",
    indice: "MarketVector Brazil Quality",
    descricao: "ETF negociado na B3 que busca acompanhar um índice de ações brasileiras de empresas de qualidade (boa rentabilidade, endividamento controlado e lucros consistentes). Dá exposição diversificada à bolsa brasileira em um único papel.",
    risco: "Renda variável: oscila com a bolsa brasileira.",
    fontes: [{ nome: "Rio Bravo / Investo", url: "https://investo.com.br" }],
  },
  LFTS11: {
    classe: "ETF de renda fixa pós-fixada (B3)",
    indice: "Teva Tesouro Selic",
    descricao: "ETF negociado na B3 que investe em títulos públicos federais pós-fixados (Tesouro Selic, LFT), acompanhando a taxa Selic. É a parte mais conservadora da carteira e serve como reserva de liquidez; pode ser vendido a qualquer momento no pregão.",
    risco: "Risco muito baixo: baixa oscilação, que acompanha a Selic.",
    fontes: [{ nome: "Investo", url: "https://investo.com.br" }],
  },
  B5MB11: {
    classe: "ETF de renda fixa pública, juros reais longos (B3)",
    indice: "IMA-B 5+ (Anbima)",
    descricao: "ETF do Bradesco negociado na B3 que investe em títulos públicos atrelados à inflação (IPCA) com vencimento acima de 5 anos. Rende inflação mais juros reais, mas o preço do ETF sobe e desce conforme as taxas de juros do mercado.",
    risco: "Oscila bastante no curto prazo quando os juros mudam; é mais adequado para prazos longos.",
    fontes: [{ nome: "Bradesco Asset", url: "https://www.bradescoasset.com.br" }],
  },
};

// ── Yahoo: quoteSummary ────────────────────────────────────────────────────────

export type YahooSummary = {
  nome: string | null;
  gestora: string | null;
  tipoYahoo: string | null;
  patrimonioFundo: { valor: number; moeda: string | null } | null;
  descricao: string | null;
  setor: string | null;
  industria: string | null;
  site: string | null;
  pais: string | null;
  funcionarios: number | null;
};

// Converte a resposta bruta do Yahoo (função pura, testável)
export function lerYahooSummary(res: unknown): YahooSummary | null {
  if (!res || typeof res !== "object") return null;
  const r = res as {
    price?: { longName?: string; shortName?: string; currency?: string };
    quoteType?: { quoteType?: string };
    fundProfile?: { family?: string };
    summaryDetail?: { totalAssets?: { raw?: number } };
    assetProfile?: { longBusinessSummary?: string; sector?: string; industry?: string; website?: string; country?: string; fullTimeEmployees?: number };
  };
  const ap = r.assetProfile;
  const total = r.summaryDetail?.totalAssets?.raw;
  return {
    nome: r.price?.longName ?? r.price?.shortName ?? null,
    gestora: r.fundProfile?.family ?? null,
    tipoYahoo: r.quoteType?.quoteType ?? null,
    patrimonioFundo: total && total > 0 ? { valor: total, moeda: r.price?.currency ?? null } : null,
    descricao: ap?.longBusinessSummary?.trim() || null,
    setor: ap?.sector ?? null,
    industria: ap?.industry ?? null,
    site: ap?.website ?? null,
    pais: ap?.country ?? null,
    funcionarios: ap?.fullTimeEmployees ?? null,
  };
}

export async function buscarYahooSummary(ticker: string): Promise<YahooSummary | null> {
  try {
    const auth = await getYahooAuth();
    if (!auth) return null;
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}`
      + `?modules=assetProfile,fundProfile,summaryDetail,quoteType,price&crumb=${encodeURIComponent(auth.crumb)}`;
    const res = await fetch(url, { headers: { "User-Agent": YF_UA, Cookie: auth.cookies }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    return lerYahooSummary(json?.quoteSummary?.result?.[0]);
  } catch {
    return null;
  }
}

// ── Montagem da ficha ──────────────────────────────────────────────────────────

const fmtGrande = (v: number, moeda: string | null) => {
  const abre = v >= 1e9 ? `${(v / 1e9).toFixed(1).replace(".", ",")} bi` : v >= 1e6 ? `${(v / 1e6).toFixed(1).replace(".", ",")} mi` : v.toLocaleString("pt-BR");
  return `${moeda ? `${moeda} ` : ""}${abre}`;
};

export type AtivoBase = {
  codigo: string; ticker_cotacao: string | null; tipo: TipoAtivo;
  gestora: string | null; taxa_adm_pct: number; sede: string | null;
};

export function montarInfo(a: AtivoBase, y: YahooSummary | null, agora = new Date()): AtivoInfo {
  const cat = CATALOGO[a.codigo.toUpperCase()];
  const destaques: Destaque[] = [];
  const add = (rotulo: string, valor: string | null | undefined) => { if (valor) destaques.push({ rotulo, valor }); };
  const ehAcao = a.tipo === "acao" || a.tipo === "bdr";

  add("Classe", cat?.classe);
  add("Índice de referência", cat?.indice);
  add("Gestora", a.gestora || y?.gestora);
  if (a.taxa_adm_pct > 0) add("Taxa de administração", `${a.taxa_adm_pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% ao ano (cadastrada no app)`);
  add("Sede", a.sede);
  add("Setor", y?.setor);
  add("Segmento", y?.industria);
  add("País", y?.pais);
  if (y?.funcionarios) add("Funcionários", y.funcionarios.toLocaleString("pt-BR"));
  if (y?.patrimonioFundo) add("Patrimônio do fundo", fmtGrande(y.patrimonioFundo.valor, y.patrimonioFundo.moeda));
  add("Risco", cat?.risco);
  if (y?.site) add("Site", y.site);

  const fontes: FonteInfo[] = [];
  if (a.ticker_cotacao && y) fontes.push(YAHOO(a.ticker_cotacao));
  fontes.push(...(cat?.fontes ?? []));

  const descYahoo = ehAcao ? y?.descricao ?? null : null;
  return {
    codigo: a.codigo,
    nome: y?.nome ?? a.codigo,
    tipo: a.tipo,
    tipoNome: TIPO_NOME[a.tipo],
    descricao: cat?.descricao ?? descYahoo,
    idiomaOriginal: !cat && !!descYahoo,
    destaques,
    fontes,
    atualizadoEm: agora.toISOString(),
  };
}

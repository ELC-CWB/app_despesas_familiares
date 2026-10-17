import { SGS_CDI_DIARIA, fetchSgsRange } from "@/lib/market/bcb";
import { tickerCambio } from "@/lib/market/normalizar";
import { fetchYahooChart, type YahooChart } from "@/lib/market/yahoo";
import {
  alinhar, emReais, indiceCarteira, indiceCdi, indiceDePreco, uniaoDeDatas,
  type MovHistorico, type PontoDia, type PrecosPorAtivo,
} from "@/lib/carteira/historico";

// Monta as séries dos gráficos da Visão geral (carteira x CDI, Ibovespa e S&P 500; e cada ativo).
// Busca o histórico diário no Yahoo (ativos, índices e câmbio) e o CDI no Banco Central, guarda em memória
// por 1 hora (não pesa a cada visita) e devolve tudo como NÍVEIS acumulados; a tela escolhe o período.

export type AtivoHistorico = { id: string; codigo: string; ticker_cotacao: string | null; mercado: "brasil" | "exterior" };
export type MovBruta = {
  data: string; tipo: "compra" | "venda" | "provento"; ativo_id: string; quantidade: number | null;
  valor_bruto: number; cambio_usado: number | null; ptax_venda: number | null;
};

export type RespostaHistorico = {
  datas: string[];
  inicio: string | null;                 // primeiro dia com posição na carteira
  carteira: (number | null)[];
  cdi: (number | null)[];
  ibov: (number | null)[];
  sp500: (number | null)[];              // S&P 500 em reais (índice em dólar × câmbio)
  ativos: { id: string; codigo: string; mercado: "brasil" | "exterior"; desde: string | null; serie: (number | null)[] }[];
  avisos: string[];
  atualizadoEm: string;
};

const VAZIA = (avisos: string[]): RespostaHistorico => ({
  datas: [], inicio: null, carteira: [], cdi: [], ibov: [], sp500: [], ativos: [], avisos, atualizadoEm: new Date().toISOString(),
});

const cache = new Map<string, { expira: number; chart: YahooChart | null }>();
const TTL_MS = 60 * 60 * 1000;

async function historicoYahoo(ticker: string, range: string): Promise<YahooChart | null> {
  const chave = `${ticker}|${range}`;
  const guardado = cache.get(chave);
  if (guardado && guardado.expira > Date.now()) return guardado.chart;
  const chart = await fetchYahooChart(ticker, { range, interval: "1d" });
  if (chart) cache.set(chave, { expira: Date.now() + TTL_MS, chart });
  return chart ?? guardado?.chart ?? null;
}

// Menor intervalo do Yahoo que cobre o período desde a primeira operação
export function intervaloYahoo(primeiraData: string, hoje: string): string {
  const dias = (Date.parse(hoje) - Date.parse(primeiraData)) / 86400000 + 10;
  return dias <= 365 ? "1y" : dias <= 730 ? "2y" : dias <= 1826 ? "5y" : dias <= 3652 ? "10y" : "max";
}

const arred = (v: number | null) => (v == null ? null : Math.round(v * 1e6) / 1e6);
const arredSerie = (s: (number | null)[]) => s.map(arred);
const dias = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
const pontos = (c: YahooChart | null): PontoDia[] => (c ? c.dias.map((d) => ({ data: d.data, valor: d.fechamento })) : []);

export async function montarHistorico(ativos: AtivoHistorico[], movs: MovBruta[], hoje: string): Promise<RespostaHistorico> {
  if (!movs.length) return VAZIA([]);
  const primeira = movs.map((m) => m.data).sort()[0];
  // Indicadores (CDI, Ibovespa, S&P 500 e câmbio) sempre desde ~10 anos atrás, mesmo que a carteira seja mais nova:
  // assim dá para ver períodos longos só com os indicadores. A API do BCB aceita no máximo 10 anos por consulta.
  const de = dias(hoje, -3640);
  const range = intervaloYahoo(primeira, hoje); // ativos: só desde a primeira operação
  const avisos: string[] = [];

  const comTicker = ativos.filter((a) => a.ticker_cotacao);
  const [chartsAtivos, ibov, sp, cdiBruto] = await Promise.all([
    Promise.all(comTicker.map((a) => historicoYahoo(a.ticker_cotacao as string, range))),
    historicoYahoo("^BVSP", "10y"),
    historicoYahoo("^GSPC", "10y"),
    fetchSgsRange(SGS_CDI_DIARIA, de, hoje, { timeoutMs: 9000, tentativas: 3 }).catch(() => null),
  ]);

  // câmbios necessários: um por moeda de preço (USD, GBP...) + dólar para o S&P 500
  const moedas = new Set<string>(["USD"]);
  for (const c of chartsAtivos) if (c?.moeda && c.moeda !== "BRL") moedas.add(c.moeda);
  const listaMoedas = [...moedas];
  const cambios = await Promise.all(listaMoedas.map((m) => { const t = tickerCambio(m); return t ? historicoYahoo(t, "10y") : Promise.resolve(null); }));
  const cambioPorMoeda = new Map(listaMoedas.map((m, i) => [m, cambios[i]]));

  const todas = [...chartsAtivos, ibov, sp, ...cambios].map(pontos);
  const datas = uniaoDeDatas(todas, de, hoje);
  if (!datas.length) return VAZIA(["Não foi possível obter o histórico de preços agora. Tente de novo mais tarde."]);

  const cambioAlinhado = (moeda: string | null | undefined): (number | null)[] | null => {
    if (!moeda || moeda === "BRL") return null;
    const c = cambioPorMoeda.get(moeda);
    return c ? alinhar(datas, pontos(c)) : datas.map(() => null);
  };

  const precos: PrecosPorAtivo = {};
  const semHistorico: string[] = [];
  comTicker.forEach((a, i) => {
    const chart = chartsAtivos[i];
    if (!chart || !chart.dias.length) { semHistorico.push(a.codigo); return; }
    precos[a.id] = emReais(alinhar(datas, pontos(chart)), cambioAlinhado(chart.moeda));
  });
  for (const a of ativos) if (!a.ticker_cotacao) semHistorico.push(a.codigo);
  if (semHistorico.length) avisos.push(`Sem histórico de preços de ${[...new Set(semHistorico)].join(", ")}: ficam fora dos gráficos.`);

  const porId = new Map(ativos.map((a) => [a.id, a]));
  const movsHist: MovHistorico[] = movs
    .filter((m) => porId.has(m.ativo_id))
    .map((m) => {
      const exterior = porId.get(m.ativo_id)?.mercado === "exterior";
      return {
        data: m.data, tipo: m.tipo, ativo_id: m.ativo_id, quantidade: m.quantidade,
        valorBRL: m.tipo === "provento" ? m.valor_bruto * (exterior ? m.ptax_venda ?? m.cambio_usado ?? 1 : 1) : 0,
      };
    });

  const { indice, inicio } = indiceCarteira(datas, movsHist, precos);

  const usd = cambioAlinhado("USD");
  const sp500 = sp ? indiceDePreco(emReais(alinhar(datas, pontos(sp)), usd)) : datas.map(() => null);
  const ibovIdx = ibov ? indiceDePreco(alinhar(datas, pontos(ibov))) : datas.map(() => null);
  if (!ibov) avisos.push("Histórico do Ibovespa indisponível agora.");
  if (!sp) avisos.push("Histórico do S&P 500 indisponível agora.");
  if (!cdiBruto) avisos.push("Histórico do CDI indisponível agora (Banco Central).");
  const cdi = indiceCdi(datas, (cdiBruto ?? []).map((p) => ({ data: p.date, valor: p.valor })), cdiBruto?.length ? datas[0] : null);

  // primeiro dia de cada ativo na carteira (a linha dele nasce aí)
  const primeiraCompra = new Map<string, string>();
  for (const m of [...movs].sort((a, b) => a.data.localeCompare(b.data))) {
    if (m.tipo === "compra" && !primeiraCompra.has(m.ativo_id)) primeiraCompra.set(m.ativo_id, m.data);
  }
  const ativosSeries = ativos
    .filter((a) => precos[a.id] && primeiraCompra.has(a.id))
    .map((a) => ({ id: a.id, codigo: a.codigo, mercado: a.mercado, desde: primeiraCompra.get(a.id) ?? null, serie: arredSerie(indiceDePreco(precos[a.id])) }));

  return {
    datas, inicio,
    carteira: arredSerie(indice), cdi: arredSerie(cdi), ibov: arredSerie(ibovIdx), sp500: arredSerie(sp500),
    ativos: ativosSeries, avisos, atualizadoEm: new Date().toISOString(),
  };
}

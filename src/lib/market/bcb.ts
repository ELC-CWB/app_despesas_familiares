// Banco Central do Brasil — Sistema Gerenciador de Séries Temporais (SGS)
// https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados

const SERIES = {
  selic: 432,     // Selic Meta, % a.a.
  cdi: 4392,      // CDI acumulado no mês, anualizado base 252, % a.a.
  ipca12m: 13522, // IPCA acumulado 12 meses, % a.a. (inflação oficial)
  ipcaMes: 433,   // IPCA variação mensal, %
  igpm: 189,      // IGP-M variação mensal, %
  poupanca: 195,  // Poupança, rendimento no período de referência, %
} as const;

// Daily/monthly series codes (IPCA mensal = SGS 433, used by the Carteira plan and withdrawals)
export const SGS_SELIC_DIARIA = 11;
export const SGS_CDI_DIARIA = 12;
export const SGS_IPCA_MENSAL = SERIES.ipcaMes;

export interface BcbIndicators {
  selic: number | null;
  cdi: number | null;
  ipca12m: number | null;
  ipcaMes: number | null;
  igpm: number | null;
  poupanca: number | null;
  referenceDate: string | null;
}

type CacheEntry = { data: BcbIndicators; expiresAt: number };
let cache: CacheEntry | null = null;
const TTL_MS = 6 * 60 * 60 * 1000;

async function fetchSgsLastValue(code: number): Promise<{ valor: number; data: string } | null> {
  try {
    const res = await fetch(
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/1?formato=json`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;

    const json = await res.json();
    if (!Array.isArray(json) || json.length === 0) return null;

    const last = json[json.length - 1] as { data?: string; valor?: string };
    if (!last?.data || !last?.valor) return null;

    const valor = parseFloat(last.valor.replace(",", "."));
    if (Number.isNaN(valor)) return null;

    return { valor, data: last.data };
  } catch {
    return null;
  }
}

function parseBrDate(d: string): number {
  const [dd, mm, yyyy] = d.split("/");
  return new Date(`${yyyy}-${mm}-${dd}`).getTime();
}

export async function fetchBcbIndicators(): Promise<BcbIndicators> {
  if (cache && Date.now() < cache.expiresAt) return cache.data;

  const keys = Object.keys(SERIES) as (keyof typeof SERIES)[];
  const results = await Promise.allSettled(keys.map(key => fetchSgsLastValue(SERIES[key])));

  const data: BcbIndicators = {
    selic: null,
    cdi: null,
    ipca12m: null,
    ipcaMes: null,
    igpm: null,
    poupanca: null,
    referenceDate: null,
  };

  let latestDate: string | null = null;
  let latestTs = -Infinity;
  let anySuccess = false;

  results.forEach((result, i) => {
    if (result.status !== "fulfilled" || !result.value) return;
    const key = keys[i];
    data[key] = result.value.valor;
    anySuccess = true;

    const ts = parseBrDate(result.value.data);
    if (ts > latestTs) {
      latestTs = ts;
      latestDate = result.value.data;
    }
  });

  data.referenceDate = latestDate;

  if (anySuccess) {
    cache = { data, expiresAt: Date.now() + TTL_MS };
  }

  return data;
}

// ── PTAX do dólar (Olinda, CotacaoDolarPeriodo) ─────────────────────────────────

export type PtaxDia = { data: string; compra: number; venda: number }; // data ISO

// Olinda usa datas MM-DD-AAAA. Um registro por dia útil (o fechamento do dia).
export async function fetchPtaxPeriodo(dataInicialIso: string, dataFinalIso: string): Promise<PtaxDia[] | null> {
  const mdY = (iso: string) => { const [y, m, d] = iso.split("-"); return `${m}-${d}-${y}`; };
  const url =
    "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/" +
    "CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)" +
    `?@dataInicial='${mdY(dataInicialIso)}'&@dataFinalCotacao='${mdY(dataFinalIso)}'` +
    "&$format=json&$select=cotacaoCompra,cotacaoVenda,dataHoraCotacao";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    const rows = (json?.value ?? []) as { cotacaoCompra: number; cotacaoVenda: number; dataHoraCotacao: string }[];
    // Se houver mais de um registro no dia, fica o último (o fechamento)
    const porDia = new Map<string, PtaxDia>();
    for (const r of rows) {
      const data = r.dataHoraCotacao.slice(0, 10);
      porDia.set(data, { data, compra: r.cotacaoCompra, venda: r.cotacaoVenda });
    }
    return [...porDia.values()];
  } catch {
    return null;
  }
}

// ── Historical daily/monthly series ─────────────────────────────────────────────

export type SgsPoint = { date: string; valor: number }; // date normalized to ISO YYYY-MM-DD

function isoToBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function brToIso(br: string): string {
  const [d, m, y] = br.split("/");
  return `${y}-${m}-${d}`;
}

type RangeCacheEntry = { dataInicial: string; dataFinal: string; series: SgsPoint[]; expiresAt: number };
const rangeCache = new Map<number, RangeCacheEntry>();
const RANGE_TTL_MS = 6 * 60 * 60 * 1000;

async function fetchSgsRangeRaw(code: number, dataInicialIso: string, dataFinalIso: string): Promise<SgsPoint[] | null> {
  try {
    const res = await fetch(
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?dataInicial=${isoToBr(dataInicialIso)}&dataFinal=${isoToBr(dataFinalIso)}&formato=json`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!res.ok) return null;

    const json = await res.json();
    if (!Array.isArray(json)) return null;

    const points: SgsPoint[] = [];
    for (const row of json as { data?: string; valor?: string }[]) {
      if (!row?.data || !row?.valor) continue;
      const valor = parseFloat(row.valor.replace(",", "."));
      if (Number.isNaN(valor)) continue;
      points.push({ date: brToIso(row.data), valor });
    }
    return points;
  } catch {
    return null;
  }
}

// Fetches a daily/monthly BCB series over [dataInicialIso, dataFinalIso].
// Caches per series code, expanding the cached window as needed; falls back to
// stale cached data (rather than null) if a refetch fails, so a transient BCB
// outage never blanks out a value that was previously known.
export async function fetchSgsRange(code: number, dataInicialIso: string, dataFinalIso: string): Promise<SgsPoint[] | null> {
  const cached = rangeCache.get(code);
  const cacheCoversRange = cached && cached.dataInicial <= dataInicialIso && cached.dataFinal >= dataFinalIso;

  if (cached && cacheCoversRange && Date.now() < cached.expiresAt) {
    return cached.series.filter(p => p.date >= dataInicialIso && p.date <= dataFinalIso);
  }

  const fetchInicial = cached && cached.dataInicial < dataInicialIso ? cached.dataInicial : dataInicialIso;
  const fetchFinal = cached && cached.dataFinal > dataFinalIso ? cached.dataFinal : dataFinalIso;

  const fresh = await fetchSgsRangeRaw(code, fetchInicial, fetchFinal);
  if (fresh) {
    rangeCache.set(code, { dataInicial: fetchInicial, dataFinal: fetchFinal, series: fresh, expiresAt: Date.now() + RANGE_TTL_MS });
    return fresh.filter(p => p.date >= dataInicialIso && p.date <= dataFinalIso);
  }

  if (cached) {
    return cached.series.filter(p => p.date >= dataInicialIso && p.date <= dataFinalIso);
  }

  return null;
}

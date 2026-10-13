// Yahoo Finance (API não oficial) — serviço compartilhado de cotações.
// Tickers sempre no formato da fonte, com sufixo: QLBR11.SA, VALU.L, USDBRL=X.

import { dataPregao, normalizarPreco } from "@/lib/market/normalizar";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type Auth = { crumb: string; cookies: string; expiresAt: number };
let cache: Auth | null = null;

export const YF_UA = UA;

// Cookie + crumb exigidos pelo endpoint v7 (quote). O v8 (chart) dispensa.
export async function getYahooAuth(): Promise<{ crumb: string; cookies: string } | null> {
  if (cache && Date.now() < cache.expiresAt) {
    return cache;
  }

  try {
    // Step 1: Fetch Yahoo Finance to get session cookies
    const pageRes = await fetch("https://finance.yahoo.com/", {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-US,en;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    // Collect all Set-Cookie values (Node 18+ has getSetCookie(); fallback to single header)
    const rawCookies: string[] =
      typeof (pageRes.headers as { getSetCookie?: () => string[] }).getSetCookie === "function"
        ? (pageRes.headers as { getSetCookie: () => string[] }).getSetCookie()
        : [pageRes.headers.get("set-cookie") ?? ""].filter(Boolean);

    const cookieStr = rawCookies.map(c => c.split(";")[0]).join("; ");

    // Step 2: Get crumb (requires valid session cookies)
    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, Cookie: cookieStr },
      signal: AbortSignal.timeout(5000),
    });

    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.startsWith("<")) return null;

    cache = { crumb, cookies: cookieStr, expiresAt: Date.now() + 3_600_000 };
    return { crumb, cookies: cookieStr };
  } catch {
    return null;
  }
}

// Cotação atual de vários tickers numa chamada (endpoint v7).
export function yahooQuoteFetch(
  tickers: string[],
  fields: string,
  auth: { crumb: string; cookies: string } | null,
  timeoutMs = 10000,
): Promise<Response> {
  const syms = tickers.map(encodeURIComponent).join(",");
  const crumbParam = auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : "";
  const headers: Record<string, string> = { "User-Agent": UA };
  if (auth?.cookies) headers["Cookie"] = auth.cookies;

  return fetch(
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms}${crumbParam}&fields=${fields}`,
    { headers, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) },
  );
}

// ── Histórico diário (endpoint v8 chart, não exige crumb) ───────────────────────

// Um dia de pregão, com o preço já normalizado (GBp → GBP) e a data no fuso da bolsa
export type YahooDia = { data: string; fechamento: number; volume: number | null };

export type YahooChart = {
  ticker: string;
  nome: string | null;
  moeda: string | null;         // já normalizada
  moedaOriginal: string | null; // como o Yahoo devolveu (ex.: "GBp")
  pregaoAberto: boolean;        // o último dia ainda não é fechamento
  dias: YahooDia[];             // em ordem cronológica
};

export async function fetchYahooChart(
  ticker: string,
  { range = "5d", interval = "1d" }: { range?: string; interval?: string } = {},
): Promise<YahooChart | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}`,
      { headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) return null;

    const json = await res.json();
    const result = json?.chart?.result?.[0] as {
      meta?: {
        currency?: string; longName?: string; shortName?: string; gmtoffset?: number;
        regularMarketPrice?: number; regularMarketTime?: number;
        currentTradingPeriod?: { regular?: { start?: number; end?: number } };
      };
      timestamp?: (number | null)[];
      indicators?: { quote?: { close?: (number | null)[]; volume?: (number | null)[] }[] };
    } | undefined;
    if (!result) return null;

    const meta = result.meta ?? {};
    const off = meta.gmtoffset ?? 0;
    const quote = result.indicators?.quote?.[0] ?? {};
    const porDia = new Map<string, YahooDia>();
    (result.timestamp ?? []).forEach((ts, i) => {
      const bruto = quote.close?.[i];
      if (!ts || !bruto || bruto <= 0) return;
      const { preco } = normalizarPreco(bruto, meta.currency);
      porDia.set(dataPregao(ts, off), { data: dataPregao(ts, off), fechamento: preco, volume: quote.volume?.[i] ?? null });
    });

    // O preço mais recente vem em regularMarketPrice; garante o dia dele na série
    if (meta.regularMarketPrice && meta.regularMarketTime) {
      const dia = dataPregao(meta.regularMarketTime, off);
      const { preco } = normalizarPreco(meta.regularMarketPrice, meta.currency);
      porDia.set(dia, { data: dia, fechamento: preco, volume: porDia.get(dia)?.volume ?? null });
    }

    const agora = Date.now() / 1000;
    const periodo = meta.currentTradingPeriod?.regular;
    const pregaoAberto = !!periodo?.start && !!periodo?.end && agora >= periodo.start && agora < periodo.end;

    return {
      ticker,
      nome: meta.longName ?? meta.shortName ?? null,
      moeda: normalizarPreco(1, meta.currency).moeda,
      moedaOriginal: meta.currency ?? null,
      pregaoAberto,
      dias: [...porDia.values()].sort((a, b) => a.data.localeCompare(b.data)),
    };
  } catch {
    return null;
  }
}

// Yahoo Finance (API não oficial) — serviço compartilhado de cotações.
// Tickers sempre no formato da fonte, com sufixo: QLBR11.SA, VALU.L, USDBRL=X.

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

// ── Histórico (endpoint v8 chart) ───────────────────────────────────────────────

export type YahooChartPoint = { date: number; close: number; volume: number };

export type YahooChart = {
  ticker: string;
  currency: string | null; // atenção: alguns tickers .L vêm em "GBp" (pence)
  regularMarketPrice: number | null;
  regularMarketTime: number | null; // epoch em segundos
  points: YahooChartPoint[];
};

export async function fetchYahooChart(
  ticker: string,
  { range = "1mo", interval = "1d" }: { range?: string; interval?: string } = {},
): Promise<YahooChart | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}`,
      { headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) return null;

    const json = await res.json();
    const result = json?.chart?.result?.[0] as {
      meta?: { currency?: string; regularMarketPrice?: number; regularMarketTime?: number };
      timestamp?: (number | null)[];
      indicators?: { quote?: { close?: (number | null)[]; volume?: (number | null)[] }[] };
    } | undefined;
    if (!result) return null;

    const quote = result.indicators?.quote?.[0] ?? {};
    const points = (result.timestamp ?? [])
      .map((ts, i) => ({ date: ts ?? 0, close: quote.close?.[i] ?? 0, volume: quote.volume?.[i] ?? 0 }))
      .filter((p) => p.date > 0 && p.close > 0);

    return {
      ticker,
      currency: result.meta?.currency ?? null,
      regularMarketPrice: result.meta?.regularMarketPrice ?? null,
      regularMarketTime: result.meta?.regularMarketTime ?? null,
      points,
    };
  } catch {
    return null;
  }
}

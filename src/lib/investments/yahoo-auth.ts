const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type Auth = { crumb: string; cookies: string; expiresAt: number };
let cache: Auth | null = null;

export const YF_UA = UA;

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

export function yahooV7Fetch(
  symbols: string[],
  fields: string,
  auth: { crumb: string; cookies: string } | null,
  timeoutMs = 10000,
): Promise<Response> {
  const syms = symbols.map(s => `${s}.SA`).join(",");
  const crumbParam = auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : "";
  const headers: Record<string, string> = { "User-Agent": UA };
  if (auth?.cookies) headers["Cookie"] = auth.cookies;

  return fetch(
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms}${crumbParam}&fields=${fields}`,
    { headers, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) },
  );
}

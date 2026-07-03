import https from "node:https";

function parseBRNumber(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

/** Fetches a Fundamentus page using node:https with Latin-1 decoding */
export function fetchFundamentusHtml(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: "www.fundamentus.com.br", path, method: "GET", headers: { "User-Agent": "Mozilla/5.0" } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("latin1")));
      }
    );
    req.setTimeout(10000, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

// ─── Proventos ─────────────────────────────────────────────────────────────────

export interface ProventoRecord {
  exDate: string;      // YYYY-MM-DD (Data Ex)
  paymentDate: string; // YYYY-MM-DD (Data de Pagamento — equals exDate when not available)
  rate: number;        // R$/ação
  label: string;       // "JCP", "DIVIDENDO", etc.
}

/**
 * Fetches all proventos (dividendos + JCP) from Fundamentus proventos.php.
 * Returns records going back `yearsBack` years plus any future announced payments.
 */
export async function fetchFundamentusProventos(
  symbol: string,
  yearsBack = 7
): Promise<ProventoRecord[]> {
  try {
    const html = await fetchFundamentusHtml(
      `/proventos.php?papel=${encodeURIComponent(symbol)}&tipo=2`
    );
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - yearsBack);

    const results: ProventoRecord[] = [];
    const seen = new Set<string>();

    // Primary: all 4 columns — ex-date, valor, tipo, payment-date
    const fullRe = /<tr[^>]*>\s*<td[^>]*>(\d{2})\/(\d{2})\/(\d{4})<\/td>\s*<td[^>]*>([\d,]+)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>(\d{2})\/(\d{2})\/(\d{4})<\/td>/g;
    for (const m of html.matchAll(fullRe)) {
      const exDate = `${m[3]}-${m[2]}-${m[1]}`;
      const payDate = `${m[8]}-${m[7]}-${m[6]}`;
      const key = `${exDate}|${m[4]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const dt = new Date(exDate);
      if (isNaN(dt.getTime()) || dt < cutoff) continue;
      const rate = parseFloat(m[4].replace(",", "."));
      if (rate <= 0) continue;
      results.push({ exDate, paymentDate: payDate, rate, label: m[5].trim().toUpperCase() || "DIVIDENDO" });
    }

    // Fallback: rows where payment-date column is missing or not a date
    if (results.length === 0) {
      const simpleRe = /<tr[^>]*>\s*<td[^>]*>(\d{2})\/(\d{2})\/(\d{4})<\/td>\s*<td[^>]*>([\d,]+)<\/td>\s*<td[^>]*>([^<]*)<\/td>/g;
      for (const m of html.matchAll(simpleRe)) {
        const exDate = `${m[3]}-${m[2]}-${m[1]}`;
        const dt = new Date(exDate);
        if (isNaN(dt.getTime()) || dt < cutoff) continue;
        const rate = parseFloat(m[4].replace(",", "."));
        if (rate <= 0) continue;
        results.push({ exDate, paymentDate: exDate, rate, label: m[5].trim().toUpperCase() || "DIVIDENDO" });
      }
    }

    return results;
  } catch {
    return [];
  }
}

// ─── Fundamentals ─────────────────────────────────────────────────────────────

export interface FundamentusData {
  price: number;
  // Valuation multiples
  pl: number | null;
  pvp: number | null;
  pEbitda: number | null;
  pEbit: number | null;
  evEbitda: number | null;
  evEbit: number | null;
  psr: number | null;
  pAtivo: number | null;
  // Per share
  lpa: number | null;
  vpa: number | null;
  dy: number | null;
  dpa: number | null;
  payout: number | null;
  // Margins (already in %, e.g. 15.30 means 15.30%)
  margBruta: number | null;
  margEbitda: number | null;
  margEbit: number | null;
  margLiquida: number | null;
  // Returns (already in %)
  roe: number | null;
  roic: number | null;
  giroAtivo: number | null;
  // Liquidity / Debt
  liqCorrente: number | null;
  divBrutaPl: number | null;
  // Financials in R$ thousands (multiply ×1000 for actual R$)
  netDebt: number | null;
  totalDebt: number | null;
  netRevenue: number | null;
  ebitda: number | null;   // derived: Valor da firma / EV_EBITDA
  ebit: number | null;     // derived: Valor da firma / EV_EBIT
  netIncome: number | null;
  cash: number | null;
  totalAssets: number | null;
  equity: number | null;
  marketCap: number | null; // R$ thousands — multiply ×1000 for fmtLarge usage
}

/** Parses detalhes.php and returns all available fundamental indicators */
export async function fetchFundamentusIndicators(symbol: string): Promise<FundamentusData | null> {
  try {
    const html = await fetchFundamentusHtml(`/detalhes.php?papel=${encodeURIComponent(symbol)}`);
    const pairs = new Map<string, number>();
    const re = /<span class="txt">([^<]+)<\/span><\/td>\s*<td class="data[^"]*"><span class="txt">\s*([^<]+)<\/span>/g;
    for (const m of html.matchAll(re)) {
      const key = m[1].trim();
      const raw = m[2].trim().replace(/[^\d,.\-]/g, "");
      if (!raw) continue;
      const val = parseBRNumber(raw);
      if (!isNaN(val)) pairs.set(key, val);
    }

    const g = (k: string) => pairs.get(k) ?? null;

    const ev = g("Valor da firma");
    const evEbitdaRatio = g("EV / EBITDA");
    const evEbitRatio = g("EV / EBIT");
    const ebitda = ev != null && evEbitdaRatio != null && evEbitdaRatio !== 0 ? ev / evEbitdaRatio : null;
    const ebit = ev != null && evEbitRatio != null && evEbitRatio !== 0 ? ev / evEbitRatio : null;

    return {
      price: g("Cotação") ?? 0,
      pl: g("P/L"),
      pvp: g("P/VP"),
      pEbitda: g("P/EBITDA"),
      pEbit: g("P/EBIT"),
      evEbitda: evEbitdaRatio,
      evEbit: evEbitRatio,
      psr: g("PSR"),
      pAtivo: g("P/Ativo"),
      lpa: g("LPA"),
      vpa: g("VPA"),
      dy: g("Div. Yield"),
      dpa: g("Div/Ação"),
      payout: g("Payout"),
      margBruta: g("Marg. Bruta"),
      margEbitda: g("Marg. EBITDA"),
      margEbit: g("Marg. EBIT"),
      margLiquida: g("Marg. Líquida"),
      roe: g("ROE"),
      roic: g("ROIC"),
      giroAtivo: g("Giro Ativos") ?? g("Giro do Ativo"),
      liqCorrente: g("Liq. Corrente"),
      divBrutaPl: g("Dív. Bruta/Patrim."),
      netDebt: g("Dív. Líquida"),
      totalDebt: g("Dív. Bruta"),
      netRevenue: g("Receita Líquida") ?? g("Rec. Líquida"),
      ebitda,
      ebit,
      netIncome: g("Lucro Líquido"),
      cash: g("Disponibilidades"),
      totalAssets: g("Ativo"),
      equity: g("Patrim. Líq."),
      marketCap: g("Valor de Mercado"),
    };
  } catch {
    return null;
  }
}

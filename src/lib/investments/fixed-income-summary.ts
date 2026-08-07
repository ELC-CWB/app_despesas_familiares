import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSgsRange, SGS_CDI_DIARIA, SGS_SELIC_DIARIA, SGS_IPCA_MENSAL, type SgsPoint } from "@/lib/investments/bcb";
import { resolveInvestmentTarget } from "@/lib/investments/investment-group";

export type FixedIncomeIndexador = "CDI" | "SELIC" | "IPCA" | "PREFIXADO";
export type FixedIncomeTipo =
  | "CDB" | "LCI" | "LCA"
  | "TESOURO_SELIC" | "TESOURO_IPCA" | "TESOURO_PREFIXADO"
  | "DEBENTURE" | "CRI" | "CRA" | "OUTRO";

export type FixedIncomeHoldingRow = {
  id: string;
  tipo: FixedIncomeTipo;
  institution: string | null;
  indexador: FixedIncomeIndexador;
  taxa: number;
  principal: number;
  application_date: string;
  maturity_date: string;
  notes: string | null;
};

export type FixedIncomePosition = FixedIncomeHoldingRow & {
  accruedInterest: number;
  currentValue: number;
  gainPercent: number;
  daysElapsed: number;
  isMatured: boolean;
  interestUnavailable: boolean;
};

export interface FixedIncomeHoldingsData {
  holdings: FixedIncomeHoldingRow[];
  positions: FixedIncomePosition[];
  totals: { totalPrincipal: number; totalAccruedInterest: number; totalCurrentValue: number };
}

const EMPTY: FixedIncomeHoldingsData = {
  holdings: [],
  positions: [],
  totals: { totalPrincipal: 0, totalAccruedInterest: 0, totalCurrentValue: 0 },
};

const todayIso = () => new Date().toISOString().slice(0, 10);

function isoToUtcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.max(0, Math.round((isoToUtcMs(toIso) - isoToUtcMs(fromIso)) / 86400000));
}

// Product of (1 + valor/100 * pct/100) for every published point strictly after
// `fromIso` (application day itself doesn't accrue yet) up to and including `toIso`.
function compoundDailyFactor(series: SgsPoint[], fromIso: string, toIso: string, pct: number): number {
  let factor = 1;
  for (const p of series) {
    if (p.date > fromIso && p.date <= toIso) {
      factor *= 1 + (p.valor / 100) * (pct / 100);
    }
  }
  return factor;
}

// Product of (1 + valor/100) for every published IPCA month strictly after `fromIso`
// up to and including `toIso`. BCB publishes IPCA with ~1 month lag, so the current
// partial month is naturally excluded (no point exists for it yet).
function compoundIpcaFactor(series: SgsPoint[], fromIso: string, toIso: string): number {
  let factor = 1;
  for (const p of series) {
    if (p.date > fromIso && p.date <= toIso) {
      factor *= 1 + p.valor / 100;
    }
  }
  return factor;
}

export async function getFixedIncomeHoldingsData(supabase: SupabaseClient, targetProfileId: string): Promise<FixedIncomeHoldingsData> {
  const { data: rows, error } = await supabase
    .from("fixed_income_holdings")
    .select("*")
    .eq("profile_id", targetProfileId)
    .order("application_date", { ascending: true });

  if (error) throw new Error(error.message);

  const holdings = (rows ?? []) as FixedIncomeHoldingRow[];
  if (!holdings.length) return EMPTY;

  const today = todayIso();
  const earliestDate = holdings.reduce((min, h) => h.application_date < min ? h.application_date : min, holdings[0].application_date);

  const needsCdi = holdings.some(h => h.indexador === "CDI");
  const needsSelic = holdings.some(h => h.indexador === "SELIC");
  const needsIpca = holdings.some(h => h.indexador === "IPCA");

  const [cdiRes, selicRes, ipcaRes] = await Promise.allSettled([
    needsCdi ? fetchSgsRange(SGS_CDI_DIARIA, earliestDate, today) : Promise.resolve<SgsPoint[] | null>([]),
    needsSelic ? fetchSgsRange(SGS_SELIC_DIARIA, earliestDate, today) : Promise.resolve<SgsPoint[] | null>([]),
    needsIpca ? fetchSgsRange(SGS_IPCA_MENSAL, earliestDate, today) : Promise.resolve<SgsPoint[] | null>([]),
  ]);

  const cdiSeries = cdiRes.status === "fulfilled" ? cdiRes.value : null;
  const selicSeries = selicRes.status === "fulfilled" ? selicRes.value : null;
  const ipcaSeries = ipcaRes.status === "fulfilled" ? ipcaRes.value : null;

  const positions: FixedIncomePosition[] = holdings.map((h) => {
    const endDate = h.maturity_date < today ? h.maturity_date : today;
    const isMatured = h.maturity_date < today;
    const daysElapsed = daysBetween(h.application_date, endDate);

    let accruedInterest = 0;
    let interestUnavailable = false;

    if (h.indexador === "CDI" || h.indexador === "SELIC") {
      const series = h.indexador === "CDI" ? cdiSeries : selicSeries;
      if (series === null) {
        interestUnavailable = true;
      } else {
        const factor = compoundDailyFactor(series, h.application_date, endDate, h.taxa);
        accruedInterest = h.principal * (factor - 1);
      }
    } else if (h.indexador === "IPCA") {
      if (ipcaSeries === null) {
        interestUnavailable = true;
      } else {
        const fixedFactor = Math.pow(1 + h.taxa / 100, daysElapsed / 365);
        const ipcaFactor = compoundIpcaFactor(ipcaSeries, h.application_date, endDate);
        accruedInterest = h.principal * (fixedFactor * ipcaFactor - 1);
      }
    } else {
      // PREFIXADO: fixed nominal annual rate, no external series needed.
      const factor = Math.pow(1 + h.taxa / 100, daysElapsed / 365);
      accruedInterest = h.principal * (factor - 1);
    }

    const currentValue = h.principal + accruedInterest;
    const gainPercent = h.principal > 0 ? (accruedInterest / h.principal) * 100 : 0;

    return { ...h, accruedInterest, currentValue, gainPercent, daysElapsed, isMatured, interestUnavailable };
  });

  const totalPrincipal = positions.reduce((s, p) => s + p.principal, 0);
  const totalAccruedInterest = positions.reduce((s, p) => s + p.accruedInterest, 0);
  const totalCurrentValue = positions.reduce((s, p) => s + p.currentValue, 0);

  return { holdings, positions, totals: { totalPrincipal, totalAccruedInterest, totalCurrentValue } };
}

export async function getFixedIncomeSummary(supabase: SupabaseClient, userId: string) {
  const { targetProfileId, isReadOnly, ownerName } = await resolveInvestmentTarget(supabase, userId);
  const data = await getFixedIncomeHoldingsData(supabase, targetProfileId);
  return { ...data, isReadOnly, ownerName };
}

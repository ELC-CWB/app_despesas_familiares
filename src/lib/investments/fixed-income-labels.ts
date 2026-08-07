import type { FixedIncomeIndexador, FixedIncomeTipo } from "@/lib/investments/fixed-income-summary";

export const TIPO_LABELS: Record<FixedIncomeTipo, string> = {
  CDB: "CDB",
  LCI: "LCI",
  LCA: "LCA",
  TESOURO_SELIC: "Tesouro Selic",
  TESOURO_IPCA: "Tesouro IPCA+",
  TESOURO_PREFIXADO: "Tesouro Prefixado",
  DEBENTURE: "Debênture",
  CRI: "CRI",
  CRA: "CRA",
  OUTRO: "Outro",
};

export const INDEXADOR_LABELS: Record<FixedIncomeIndexador, string> = {
  CDI: "% do CDI",
  SELIC: "% da Selic",
  IPCA: "IPCA+ (% a.a.)",
  PREFIXADO: "Prefixado (% a.a.)",
};

const fmtTaxaNumber = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatTaxaLabel(indexador: FixedIncomeIndexador, taxa: number): string {
  switch (indexador) {
    case "CDI": return `${fmtTaxaNumber(taxa)}% do CDI`;
    case "SELIC": return `${fmtTaxaNumber(taxa)}% da Selic`;
    case "IPCA": return `IPCA+ ${fmtTaxaNumber(taxa)}% a.a.`;
    case "PREFIXADO": return `${fmtTaxaNumber(taxa)}% a.a.`;
  }
}

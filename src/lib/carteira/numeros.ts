// Números no formato pt-BR (SPEC §1): campos aceitam vírgula decimal e ponto de milhar.

// "1.234,56" → 1234.56 ; "3,5" → 3.5 ; "" → null. Ponto sem vírgula é tratado como milhar
// ("3.000" → 3000), como no protótipo, exceto quando parece decimal ("0.5", "12.75").
export function parseDecimal(texto: string | number | null | undefined): number | null {
  if (texto == null) return null;
  if (typeof texto === "number") return Number.isFinite(texto) ? texto : null;
  let t = texto.trim().replace(/\s|R\$|%/g, "");
  if (!t) return null;
  const negativo = t.startsWith("-");
  t = t.replace(/^-/, "");
  if (t.includes(",")) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, "");
  }
  if (!/^\d*\.?\d*$/.test(t) || t === "" || t === ".") return null;
  const v = Number(t);
  return Number.isFinite(v) ? (negativo ? -v : v) : null;
}

export function fmtNum(v: number, casasMin = 0, casasMax = 2): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casasMin, maximumFractionDigits: casasMax });
}

export function fmtBRL(v: number, casas = 2): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: casas, maximumFractionDigits: casas });
}

// Percentual em pontos: 3.5 → "3,5%"
export function fmtPct(v: number, casasMin = 0, casasMax = 2): string {
  return `${fmtNum(v, casasMin, casasMax)}%`;
}

// Valor numérico → texto editável ("3,5"); null → ""
export function paraTexto(v: number | null | undefined, casasMax = 4): string {
  return v == null ? "" : fmtNum(v, 0, casasMax).replace(/\./g, "");
}

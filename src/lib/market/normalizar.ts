// Normalização pura dos dados de cotação (sem rede), testável.

// Alguns tickers da LSE vêm em pence ("GBp" ou "GBX"): converte para libras.
export function normalizarPreco(preco: number, moeda: string | null | undefined): { preco: number; moeda: string | null } {
  if (moeda === "GBp" || moeda === "GBX") return { preco: preco / 100, moeda: "GBP" };
  if (moeda === "ZAc") return { preco: preco / 100, moeda: "ZAR" };
  return { preco, moeda: moeda ? moeda.toUpperCase() : null };
}

// Dia do pregão (YYYY-MM-DD) no fuso da bolsa, a partir do epoch do Yahoo e do gmtoffset da bolsa
export function dataPregao(epochSeg: number, gmtoffsetSeg = 0): string {
  return new Date((epochSeg + gmtoffsetSeg) * 1000).toISOString().slice(0, 10);
}

// Ticker de câmbio para converter uma moeda em reais (Yahoo): USD → USDBRL=X
export function tickerCambio(moeda: string): string | null {
  const m = moeda.toUpperCase();
  return m === "BRL" ? null : `${m}BRL=X`;
}

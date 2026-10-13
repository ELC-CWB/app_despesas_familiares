// Regras financeiras puras (docs/carteira/REGRAS.md). Sem dependência de UI ou banco.
// Percentuais em pontos (3.5 = 3,5%).

import { COR_HEX, type CorPaleta } from "@/lib/carteira/constantes";

const EPS = 1e-9;

// ── Bandas (§1) ────────────────────────────────────────────────────────────────

// Regra 5/25: 25% do alvo, limitada a 5 p.p.
export function bandaSugerida(alvoPct: number): number {
  return Math.min(5, Math.max(0, alvoPct) * 0.25);
}

// Banda vazia (null) usa a sugestão da regra 5/25
export function bandaEfetiva(alvoPct: number, bandaPp: number | null | undefined): number {
  return bandaPp == null ? bandaSugerida(alvoPct) : bandaPp;
}

export function foraDaBanda(realPct: number, alvoPct: number, bandaPp: number): boolean {
  return Math.abs(realPct - alvoPct) > bandaPp + EPS;
}

// ── Alvos ──────────────────────────────────────────────────────────────────────

export function somaAlvos(ativos: { alvo_pct: number }[]): number {
  return ativos.reduce((s, a) => s + (a.alvo_pct || 0), 0);
}

export function alvosFecham100(soma: number): boolean {
  return Math.abs(soma - 100) < 0.001;
}

// "100% ✓" | "95% · faltam 5 p.p." | "102,5% · sobram 2,5 p.p." (texto do protótipo)
export function resumoSoma(soma: number, fmt: (v: number) => string): string {
  if (alvosFecham100(soma)) return `${fmt(soma)}% ✓`;
  return soma < 100
    ? `${fmt(soma)}% · faltam ${fmt(100 - soma)} p.p.`
    : `${fmt(soma)}% · sobram ${fmt(soma - 100)} p.p.`;
}

// Alvo do bloco = soma dos alvos dos seus ativos
export function alvoDoBloco(blocoId: string, ativos: { bloco_id: string; alvo_pct: number }[]): number {
  return somaAlvos(ativos.filter((a) => a.bloco_id === blocoId));
}

// Taxa de administração média ponderada pelo alvo
export function taxaMediaPonderada(ativos: { alvo_pct: number; taxa_adm_pct: number }[]): number {
  const soma = somaAlvos(ativos);
  if (soma <= 0) return 0;
  return ativos.reduce((s, a) => s + (a.alvo_pct || 0) * (a.taxa_adm_pct || 0), 0) / soma;
}

// ── Cores ──────────────────────────────────────────────────────────────────────

// Clareia uma cor hex em direção ao branco (t = 0 → igual, 1 → branco)
export function clarear(hex: string, t: number): string {
  const canais = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16);
    return Math.round(v + (255 - v) * t).toString(16).padStart(2, "0");
  });
  return `#${canais.join("")}`;
}

// Tons dos blocos a partir da cor da geografia (como no protótipo)
export function tonsDosBlocos(
  geografias: { id: string; cor: CorPaleta }[],
  blocos: { id: string; geografia_id: string }[],
): Record<string, string> {
  const tons: Record<string, string> = {};
  for (const g of geografias) {
    const bs = blocos.filter((b) => b.geografia_id === g.id);
    bs.forEach((b, i) => {
      const t = bs.length > 1 ? 0.3 + (0.4 * i) / (bs.length - 1) : 0.4;
      tons[b.id] = clarear(COR_HEX[g.cor] ?? COR_HEX.cinza, t);
    });
  }
  return tons;
}

// ── Plano (§2) ─────────────────────────────────────────────────────────────────

// Patrimônio real ao fim da acumulação: v[t+1] = (v[t] + aporte×12) × (1 + r)
export function patrimonioFimAcumulacao(inicial: number, aporteMensal: number, anosAporte: number, rentPct: number): number {
  const r = rentPct / 100;
  let v = inicial;
  for (let t = 0; t < Math.round(anosAporte); t++) v = (v + aporteMensal * 12) * (1 + r);
  return v;
}

// Retirada máxima perpétua (% a.a.): r / (1 + r), pois o saque sai no início do ano
export function retiradaMaxPerpetua(rentPct: number): number {
  const r = rentPct / 100;
  return (r / (1 + r)) * 100;
}

export type Veredito = "verde" | "amarelo" | "vermelho";

// verde: perpétua mesmo no pessimista; amarelo: só no otimista; vermelho: não é perpétua
export function vereditoPerpetuidade(retiradaPct: number, rentPessPct: number, rentOtimPct: number): Veredito {
  if (retiradaPct <= retiradaMaxPerpetua(rentPessPct) + EPS) return "verde";
  if (retiradaPct <= retiradaMaxPerpetua(rentOtimPct) + EPS) return "amarelo";
  return "vermelho";
}

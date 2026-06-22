"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, AlertCircle, BookOpen, ArrowDownUp, Calculator } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CashDividend {
  paymentDate: string;
  rate: number;
  label: string;
  lastDatePrior: string;
}

interface TickerRow {
  symbol: string;
  shortName: string;
  logourl: string | null;
  price: number;
  dpa12m: number;
  cashDividends: CashDividend[];
  error?: string;
}

interface AnalysesClientProps {
  symbols: string[];
}

const ACCENT = "#3b82f6";
const DEFAULT_FATOR = "8";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", minimumFractionDigits: 2,
  }).format(v);
}

function fmtPct(v: number) {
  return `${v.toFixed(2).replace(".", ",")}%`;
}

function parseFator(raw: string): number {
  const clean = raw.replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) || n <= 0 ? 0.08 : n / 100;
}

function dpaForYear(divs: CashDividend[], year: number): number {
  return divs
    .filter(d => new Date(d.paymentDate).getFullYear() === year)
    .reduce((sum, d) => sum + d.rate, 0);
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function AnalysesClient({ symbols }: AnalysesClientProps) {
  const [rows, setRows] = useState<TickerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fatorInput, setFatorInput] = useState(DEFAULT_FATOR);
  const [fatorConfirmed, setFatorConfirmed] = useState(DEFAULT_FATOR);

  const fator = parseFator(fatorConfirmed);

  // Last 5 full calendar years
  const currentYear = new Date().getFullYear();
  const years = [1, 2, 3, 4, 5].map(i => currentYear - i);

  useEffect(() => {
    if (symbols.length === 0) return;
    setLoading(true);
    setError(null);
    fetch(`/api/investments/analyses?symbols=${symbols.join(",")}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) { setError(json.error); return; }
        setRows((json.results ?? []).filter((r: TickerRow) => !r.error));
      })
      .catch(() => setError("Erro de rede"))
      .finally(() => setLoading(false));
  }, [symbols]);

  const tableRows = useMemo(() => {
    return rows
      .map(r => {
        const dyByYear = years.map(y => {
          const dpa = dpaForYear(r.cashDividends ?? [], y);
          return r.price > 0 && dpa > 0 ? (dpa / r.price) * 100 : null;
        });
        return {
          ...r,
          precoTeto: fator > 0 && r.dpa12m > 0 ? r.dpa12m / fator : null,
          dyByYear,
        };
      })
      .sort((a, b) => {
        if (a.precoTeto == null && b.precoTeto == null) return 0;
        if (a.precoTeto == null) return 1;
        if (b.precoTeto == null) return -1;
        return b.precoTeto - a.precoTeto;
      });
  }, [rows, fator, years]);

  if (symbols.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center px-6">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(59,130,246,0.1)" }}>
          <BookOpen className="w-7 h-7" style={{ color: ACCENT }} />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Nenhum ativo na carteira</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Adicione ativos na aba <strong>Cotações</strong> para usar as análises.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: ACCENT }} />
        <span className="text-sm text-muted-foreground">Carregando dados...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-foreground text-sm">Preço Teto por Dividendo</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Preço Teto = DPA 12m ÷ Fator &nbsp;·&nbsp; DY histórico calculado sobre o preço atual
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Fator de referência</label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={fatorInput}
                onChange={e => setFatorInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") setFatorConfirmed(fatorInput); }}
                className="w-16 text-sm font-semibold text-right rounded-lg border border-border bg-secondary/50 px-2 py-1.5 focus:outline-none focus:ring-2"
                style={{ "--tw-ring-color": ACCENT } as React.CSSProperties}
                placeholder="8"
              />
              <span className="text-sm font-semibold text-muted-foreground">%</span>
            </div>
            <button
              onClick={() => setFatorConfirmed(fatorInput)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: ACCENT }}
            >
              <Calculator className="h-3.5 w-3.5" />
              Calcular
            </button>
          </div>
        </div>
        <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-green-500/20 border border-green-500/40" />
            <span>Preço Teto acima do preço atual (oportunidade de compra)</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground sticky left-0 bg-secondary/30">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground sticky left-7 bg-secondary/30">Ativo</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">
                  <div className="flex items-center justify-end gap-1"><ArrowDownUp className="h-3 w-3" />DPA 12m</div>
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-[10px] text-muted-foreground/60 font-normal">fator: {fatorConfirmed || "8"}%</span>
                    <div className="flex items-center gap-1"><ArrowDownUp className="h-3 w-3" />Preço Teto</div>
                  </div>
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Preço Atual</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">DY Atual</th>
                {years.map(y => (
                  <th key={y} className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">
                    DY {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, i) => {
                const teto = row.precoTeto;
                const tetoAcimaAtual = teto != null && teto > row.price;
                const dyAtual = row.price > 0 && row.dpa12m > 0
                  ? (row.dpa12m / row.price) * 100
                  : null;

                return (
                  <tr key={row.symbol} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground font-medium sticky left-0 bg-card">{i + 1}</td>

                    <td className="px-4 py-3 sticky left-7 bg-card">
                      <div className="flex items-center gap-2.5">
                        {row.logourl ? (
                          <img src={row.logourl} alt={row.symbol} className="h-7 w-7 rounded-md object-contain bg-secondary flex-shrink-0"
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          <div className="h-7 w-7 rounded-md flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0" style={{ backgroundColor: ACCENT }}>
                            {row.symbol.slice(0, 2)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground text-sm leading-tight">{row.symbol}</p>
                          <p className="text-xs text-muted-foreground max-w-[120px] truncate">{row.shortName}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right">
                      {row.dpa12m > 0
                        ? <span className="font-medium text-foreground">{fmtBRL(row.dpa12m)}</span>
                        : <span className="text-xs text-muted-foreground">–</span>}
                    </td>

                    <td className="px-4 py-3 text-right">
                      {teto != null ? (
                        <span className="inline-block px-2.5 py-1 rounded-lg font-bold text-sm"
                          style={tetoAcimaAtual
                            ? { backgroundColor: "rgba(34,197,94,0.15)", color: "#15803d" }
                            : { backgroundColor: "rgba(0,0,0,0.04)", color: "var(--foreground)" }}>
                          {fmtBRL(teto)}
                        </span>
                      ) : <span className="text-xs text-muted-foreground">–</span>}
                    </td>

                    <td className="px-4 py-3 text-right font-semibold text-foreground">{fmtBRL(row.price)}</td>

                    <td className="px-4 py-3 text-right">
                      {dyAtual != null
                        ? <span className="text-sm font-medium" style={{ color: dyAtual >= fator * 100 ? "#16a34a" : "var(--muted-foreground)" }}>{fmtPct(dyAtual)}</span>
                        : <span className="text-xs text-muted-foreground">–</span>}
                    </td>

                    {row.dyByYear.map((dy, yi) => (
                      <td key={years[yi]} className="px-4 py-3 text-right">
                        {dy != null
                          ? <span className="text-sm font-medium" style={{ color: dy >= fator * 100 ? "#16a34a" : "var(--muted-foreground)" }}>{fmtPct(dy)}</span>
                          : <span className="text-xs text-muted-foreground">–</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

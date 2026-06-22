"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, AlertCircle, BookOpen, Calculator } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CashDividend {
  paymentDate: string;
  rate: number;
}

interface TickerRow {
  symbol: string;
  shortName: string;
  logourl: string | null;
  price: number;
  dpa12m: number;
  cashDividends: CashDividend[];
}

const ACCENT = "#3b82f6";
const DEFAULT_FATOR = "8";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(v);
}

function fmtPct(v: number) {
  return `${v.toFixed(2).replace(".", ",")}%`;
}

function parseFator(raw: string): number {
  const n = parseFloat(raw.replace(",", "."));
  return isNaN(n) || n <= 0 ? 0.08 : n / 100;
}

function dpaForYear(divs: CashDividend[], year: number): number {
  return divs
    .filter(d => new Date(d.paymentDate).getFullYear() === year)
    .reduce((s, d) => s + d.rate, 0);
}

// ─── DY Cell ─────────────────────────────────────────────────────────────────

function DYCell({ dy, fator }: { dy: number | null; fator: number }) {
  if (dy == null) return <span className="text-xs text-muted-foreground">–</span>;
  const good = dy >= fator * 100;
  return (
    <span className="text-sm font-medium" style={{ color: good ? "#16a34a" : "var(--muted-foreground)" }}>
      {fmtPct(dy)}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function AnalysesClient() {
  const [rows, setRows] = useState<TickerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fatorInput, setFatorInput] = useState(DEFAULT_FATOR);
  const [fatorConfirmed, setFatorConfirmed] = useState(DEFAULT_FATOR);

  const fator = parseFator(fatorConfirmed);
  const currentYear = new Date().getFullYear();
  const years = [1, 2, 3, 4, 5].map(i => currentYear - i);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setLoadedCount(0);
    fetch("/api/investments/analyses")
      .then(r => r.json())
      .then(json => {
        if (json.error) { setError(json.error); return; }
        const valid = (json.results ?? []).filter((r: TickerRow & { error?: string }) => !r.error);
        setRows(valid);
        setLoadedCount(valid.length);
      })
      .catch(() => setError("Erro de rede"))
      .finally(() => setLoading(false));
  }, []);

  const tableRows = useMemo(() => {
    return rows
      .map(r => {
        const dyAtual = r.price > 0 && r.dpa12m > 0 ? (r.dpa12m / r.price) * 100 : null;
        const precoTeto = fator > 0 && r.dpa12m > 0 ? r.dpa12m / fator : null;
        const dyByYear = years.map(y => {
          const dpa = dpaForYear(r.cashDividends ?? [], y);
          return r.price > 0 && dpa > 0 ? (dpa / r.price) * 100 : null;
        });
        return { ...r, dyAtual, precoTeto, dyByYear };
      })
      .sort((a, b) => {
        if (a.dyAtual == null && b.dyAtual == null) return 0;
        if (a.dyAtual == null) return 1;
        if (b.dyAtual == null) return -1;
        return b.dyAtual - a.dyAtual;
      });
  }, [rows, fator, years]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: ACCENT }} />
        <span className="text-sm text-muted-foreground">
          Carregando ações da B3{loadedCount > 0 ? ` (${loadedCount} carregadas)` : "..."}
        </span>
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

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <BookOpen className="w-10 h-10" style={{ color: ACCENT }} />
        <p className="text-sm text-muted-foreground">Nenhum dado encontrado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-foreground text-sm">
              Ações B3 com dividendos — {tableRows.length} ativos
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ordenado por DY Atual (maior → menor) · Preço Teto = DPA 12m ÷ Fator · DY histórico sobre preço atual
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Fator</label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={fatorInput}
                onChange={e => setFatorInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") setFatorConfirmed(fatorInput); }}
                className="w-14 text-sm font-semibold text-right rounded-lg border border-border bg-secondary/50 px-2 py-1.5 focus:outline-none focus:ring-2"
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
        <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-green-500/20 border border-green-500/40" />
            <span>Preço Teto &gt; Preço Atual (oportunidade) · DY verde ≥ {fatorInput || "8"}%</span>
          </div>
        </div>
      </div>

      {/* Table — full width, no horizontal scroll */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-8" />          {/* # */}
            <col className="w-40" />         {/* Ativo */}
            <col className="w-24" />         {/* DPA 12m */}
            <col className="w-28" />         {/* Preço Teto */}
            <col className="w-24" />         {/* Preço Atual */}
            <col className="w-20" />         {/* DY Atual */}
            {years.map(y => <col key={y} className="w-16" />)}
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              <th className="text-center px-2 py-2.5 text-xs font-semibold text-muted-foreground">#</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">Ativo</th>
              <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground">DPA 12m</th>
              <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground">
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[10px] text-muted-foreground/60 font-normal">fator: {fatorConfirmed || "8"}%</span>
                  <span>Preço Teto</span>
                </div>
              </th>
              <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground">Preço Atual</th>
              <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground">DY Atual</th>
              {years.map(y => (
                <th key={y} className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground">
                  DY {y}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, i) => {
              const tetoMaiorAtual = row.precoTeto != null && row.precoTeto > row.price;

              return (
                <tr key={row.symbol} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors">
                  <td className="px-2 py-2 text-xs text-muted-foreground text-center">{i + 1}</td>

                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {row.logourl ? (
                        <img src={row.logourl} alt={row.symbol}
                          className="h-6 w-6 rounded object-contain bg-secondary flex-shrink-0"
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div className="h-6 w-6 rounded flex items-center justify-center text-white font-bold text-[9px] flex-shrink-0"
                          style={{ backgroundColor: ACCENT }}>
                          {row.symbol.slice(0, 2)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-xs leading-tight truncate">{row.symbol}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{row.shortName}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-2 text-right">
                    {row.dpa12m > 0
                      ? <span className="text-xs font-medium text-foreground">{fmtBRL(row.dpa12m)}</span>
                      : <span className="text-xs text-muted-foreground">–</span>}
                  </td>

                  <td className="px-3 py-2 text-right">
                    {row.precoTeto != null ? (
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-bold"
                        style={tetoMaiorAtual
                          ? { backgroundColor: "rgba(34,197,94,0.15)", color: "#15803d" }
                          : { color: "var(--foreground)" }}>
                        {fmtBRL(row.precoTeto)}
                      </span>
                    ) : <span className="text-xs text-muted-foreground">–</span>}
                  </td>

                  <td className="px-3 py-2 text-right">
                    <span className="text-xs font-semibold text-foreground">{fmtBRL(row.price)}</span>
                  </td>

                  <td className="px-3 py-2 text-right">
                    <DYCell dy={row.dyAtual} fator={fator} />
                  </td>

                  {row.dyByYear.map((dy, yi) => (
                    <td key={years[yi]} className="px-3 py-2 text-right">
                      <DYCell dy={dy} fator={fator} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

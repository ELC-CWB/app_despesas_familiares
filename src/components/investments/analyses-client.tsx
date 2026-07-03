"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, BookOpen, Search } from "lucide-react";
import { useInvestmentFilters } from "@/contexts/investment-filters-context";

interface CashDividend {
  paymentDate: string;
  rate: number;
}

interface TickerRow {
  symbol: string;
  sector: string;
  shortName: string;
  logourl: string | null;
  price: number;
  dpa12m: number;
  cashDividends: CashDividend[];
  netDebt: number | null;
  ebitda: number | null;
  payoutRatio: number | null;
}

const ACCENT = "#3b82f6";
const DEFAULT_FATOR = "8,0";

function formatFator(raw: string): string {
  const n = parseFloat(raw.replace(",", "."));
  if (isNaN(n) || n <= 0) return raw;
  return n.toFixed(1).replace(".", ",");
}

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

function DYCell({ dy, fator }: { dy: number | null; fator: number }) {
  if (dy == null || dy === 0) return <span className="text-xs text-muted-foreground">–</span>;
  const good = dy >= fator * 100;
  return (
    <span className="text-xs font-medium" style={{ color: good ? "#16a34a" : "inherit" }}>
      {fmtPct(dy)}
    </span>
  );
}

type SortCol = "price" | "precoTeto" | "dpa12m" | "dlEbitda" | "payout" | "dyAtual" | "dyMedio";

function SortBtn({ col, sortCol, sortDir, onSort }: {
  col: SortCol;
  sortCol: SortCol;
  sortDir: "asc" | "desc";
  onSort: (col: SortCol) => void;
}) {
  const active = sortCol === col;
  return (
    <button
      onClick={e => { e.stopPropagation(); onSort(col); }}
      className="inline-flex flex-col items-center leading-none select-none cursor-pointer ml-0.5 align-middle"
      style={{ color: active ? ACCENT : "var(--muted-foreground)" }}
    >
      <span className="text-[8px] leading-none block" style={{ opacity: active && sortDir === "asc" ? 1 : 0.3 }}>▲</span>
      <span className="text-[8px] leading-none block" style={{ opacity: active && sortDir === "desc" ? 1 : 0.3 }}>▼</span>
    </button>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function AnalysesClient() {
  const router = useRouter();
  const [rows, setRows] = useState<TickerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    fatorInput, setFatorInput,
    dlEbitdaFilter, setDlEbitdaFilter,
    payoutFilter, setPayoutFilter,
    analysesSearch: searchQuery, setAnalysesSearch: setSearchQuery,
    selectedSectors, setSelectedSectors,
  } = useInvestmentFilters();

  const [sortCol, setSortCol] = useState<SortCol>("dyAtual");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  }

  const fator = parseFator(fatorInput);
  const currentYear = new Date().getFullYear();
  const years = [1, 2, 3, 4, 5, 6].map(i => currentYear - i);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/api/investments/analyses")
      .then(r => r.json())
      .then(json => {
        if (json.error) { setError(json.error); return; }
        const valid = (json.results ?? []).filter((r: TickerRow & { error?: string }) => !r.error);
        setRows(valid);
      })
      .catch(() => setError("Erro de rede"))
      .finally(() => setLoading(false));
  }, []);

  const sectors = useMemo(() => [...new Set(rows.map(r => r.sector))].sort(), [rows]);

  const tableRows = useMemo(() => {
    const maxDL = dlEbitdaFilter.trim() ? parseFloat(dlEbitdaFilter.replace(",", ".")) : null;
    const maxPayout = payoutFilter.trim() ? parseFloat(payoutFilter.replace(",", ".").replace("%", "")) : null;

    return rows
      .filter(r => selectedSectors.size === 0 || selectedSectors.has(r.sector))
      .filter(r => {
        if (!searchQuery) return true;
        const q = searchQuery.toUpperCase();
        return r.symbol.includes(q) || r.shortName.toUpperCase().includes(q);
      })
      .filter(r => {
        if (maxDL == null || isNaN(maxDL)) return true;
        if (r.netDebt == null || r.ebitda == null || r.ebitda === 0) return true;
        return r.netDebt / r.ebitda <= maxDL;
      })
      .filter(r => {
        if (maxPayout == null || isNaN(maxPayout)) return true;
        if (r.payoutRatio == null) return true;
        return r.payoutRatio * 100 <= maxPayout;
      })
      .map(r => {
        const dyAtual = r.price > 0 && r.dpa12m > 0 ? (r.dpa12m / r.price) * 100 : null;
        const dyByYear = years.map(y => {
          const dpa = dpaForYear(r.cashDividends ?? [], y);
          return r.price > 0 && dpa > 0 ? (dpa / r.price) * 100 : null;
        });
        const dpaByYear = years.map(y => dpaForYear(r.cashDividends ?? [], y));
        const validDpas = dpaByYear.filter(d => d > 0);
        const dpaMedio6a = validDpas.length > 0 ? validDpas.reduce((s, d) => s + d, 0) / validDpas.length : 0;
        const precoTeto = fator > 0 && dpaMedio6a > 0 ? dpaMedio6a / fator : null;
        const validDys = dyByYear.filter((d): d is number => d != null);
        const dyMedio = validDys.length > 0 ? validDys.reduce((s, d) => s + d, 0) / validDys.length : null;
        return { ...r, dyAtual, precoTeto, dyByYear, dyMedio };
      })
      .filter(r => r.dyMedio != null && r.dyMedio > 0)
      .sort((a, b) => {
        const dir = sortDir === "desc" ? -1 : 1;
        function sortVal(r: typeof a): number | null {
          switch (sortCol) {
            case "price": return r.price > 0 ? r.price : null;
            case "precoTeto": return r.precoTeto;
            case "dpa12m": return r.dpa12m > 0 ? r.dpa12m : null;
            case "dlEbitda": return r.netDebt != null && r.ebitda != null && r.ebitda !== 0 ? r.netDebt / r.ebitda : null;
            case "payout": return r.payoutRatio != null ? r.payoutRatio * 100 : null;
            case "dyAtual": return r.dyAtual;
            case "dyMedio": return r.dyMedio;
          }
        }
        const av = sortVal(a);
        const bv = sortVal(b);
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av - bv) * dir;
      });
  }, [rows, fator, years, selectedSectors, searchQuery, dlEbitdaFilter, payoutFilter, sortCol, sortDir]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: ACCENT }} />
        <span className="text-sm text-muted-foreground">Carregando ações da B3...</span>
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

  const grpTh: React.CSSProperties = { boxShadow: "inset 0 0 0 1000px rgba(251,191,36,0.07)" };
  const grpTd: React.CSSProperties = { boxShadow: "inset 0 0 0 1000px rgba(251,191,36,0.035)" };

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="bg-card border border-border rounded-2xl px-4 py-2.5 shadow-sm space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative group/title cursor-default inline-block">
            <h2 className="font-semibold text-foreground text-sm">
              Ações B3 com dividendos — {tableRows.length} ativos
              {selectedSectors.size > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (filtrado por setor)
                </span>
              )}
            </h2>
            <div className="absolute left-0 top-full mt-1 z-30 hidden group-hover/title:block bg-popover text-popover-foreground text-xs px-3 py-2 rounded-lg shadow-lg border border-border whitespace-nowrap pointer-events-none">
              Clique nas setas para ordenar · Preço Teto = DPA 12m ÷ Fator · DY histórico sobre preço atual
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-1.5">
              <div className="relative group/dy cursor-help">
                <label className="text-xs font-bold text-muted-foreground cursor-help">DY Méd. 6a ≥</label>
                <div className="absolute right-0 top-full mt-1.5 z-30 hidden group-hover/dy:block bg-popover text-popover-foreground text-xs px-3 py-2 rounded-lg shadow-lg border border-border pointer-events-none w-64">
                  <p className="font-semibold mb-1">DY Médio 6 anos</p>
                  <p className="text-muted-foreground leading-relaxed">Média do Dividend Yield anual dos últimos 6 anos sobre o preço atual. Filtra e destaca ativos com DY Médio igual ou superior ao valor informado.</p>
                </div>
              </div>
              <div className="flex items-center rounded-lg border border-border bg-secondary/50 focus-within:ring-2"
                style={{ "--tw-ring-color": ACCENT } as React.CSSProperties}>
                <input
                  type="text"
                  value={fatorInput}
                  onChange={e => setFatorInput(e.target.value)}
                  placeholder="__,_"
                  className="w-10 text-xs font-semibold text-right bg-transparent pl-2 py-1 focus:outline-none placeholder:text-muted-foreground/50"
                />
                <span className="text-xs font-semibold pr-2 select-none">%</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="relative group/dl cursor-help">
                <label className="text-xs font-bold text-muted-foreground cursor-help">DL/EBITDA ≤</label>
                <div className="absolute right-0 top-full mt-1.5 z-30 hidden group-hover/dl:block bg-popover text-popover-foreground text-xs px-3 py-2 rounded-lg shadow-lg border border-border pointer-events-none w-64">
                  <p className="font-semibold mb-1">Dívida Líquida / EBITDA</p>
                  <p className="text-muted-foreground leading-relaxed">Indica quantos anos de geração de caixa operacional seriam necessários para quitar a dívida. Abaixo de 2x é considerado baixo endividamento; acima de 3x, elevado.</p>
                </div>
              </div>
              <input
                type="text"
                placeholder="__,_"
                value={dlEbitdaFilter}
                onChange={e => setDlEbitdaFilter(e.target.value)}
                className="w-14 text-xs font-semibold text-center rounded-lg border border-border bg-secondary/50 px-2 py-1 focus:outline-none focus:ring-2 placeholder:text-muted-foreground/50"
                style={{ "--tw-ring-color": ACCENT } as React.CSSProperties}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <div className="relative group/payout cursor-help">
                <label className="text-xs font-bold text-muted-foreground cursor-help">Payout ≤</label>
                <div className="absolute right-0 top-full mt-1.5 z-30 hidden group-hover/payout:block bg-popover text-popover-foreground text-xs px-3 py-2 rounded-lg shadow-lg border border-border pointer-events-none w-64">
                  <p className="font-semibold mb-1">Payout Ratio</p>
                  <p className="text-muted-foreground leading-relaxed">Percentual do lucro distribuído como dividendos. 100% significa que todo o lucro foi distribuído. Acima de 100% indica distribuição além do lucro gerado no período.</p>
                </div>
              </div>
              <div className="flex items-center rounded-lg border border-border bg-secondary/50 focus-within:ring-2"
                style={{ "--tw-ring-color": ACCENT } as React.CSSProperties}>
                <input
                  type="text"
                  placeholder="__,_"
                  value={payoutFilter}
                  onChange={e => setPayoutFilter(e.target.value)}
                  className="w-10 text-xs font-semibold text-right bg-transparent pl-2 py-1 focus:outline-none placeholder:text-muted-foreground/50"
                />
                <span className="text-xs font-semibold pr-2 select-none">%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Search + sector */}
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Código ou nome..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-secondary/50 focus:outline-none focus:ring-2 placeholder:text-muted-foreground/60"
              style={{ "--tw-ring-color": ACCENT } as React.CSSProperties}
            />
          </div>
          <select
            value={[...selectedSectors][0] ?? ""}
            onChange={e => setSelectedSectors(e.target.value ? new Set([e.target.value]) : new Set())}
            className="px-2 py-1.5 text-xs rounded-lg border border-border bg-secondary/50 focus:outline-none focus:ring-2 text-foreground"
            style={{ "--tw-ring-color": ACCENT } as React.CSSProperties}
          >
            <option value="">Todos os setores</option>
            {sectors.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      {/* h calc: header≈64px + padding(p-4/p-6) + controls≈120px + gap≈12px + bottom padding + mobile nav */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-y-auto h-[calc(100dvh-285px)] lg:h-[calc(100dvh-220px)] min-h-[300px]">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col style={{ width: "1.5rem" }} />
            <col style={{ width: "8.5rem" }} />
            <col style={{ width: "5.5rem" }} />
            <col style={{ width: "5.5rem" }} />
            <col style={{ width: "4.5rem" }} />
            <col style={{ width: "4.5rem" }} />
            <col style={{ width: "4rem" }} />
            <col style={{ width: "4rem" }} />
            <col style={{ width: "4rem" }} />
            {years.map(y => <col key={y} style={{ width: "3.5rem" }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky top-0 z-10 bg-card border-b border-border text-center px-1 py-2 text-xs font-semibold text-muted-foreground">#</th>
              <th className="sticky top-0 z-10 bg-card border-b border-border text-left px-1.5 py-2 text-xs font-semibold text-muted-foreground">Ativo</th>
              <th className="sticky top-0 z-10 bg-card border-b border-border text-right px-1.5 py-2 text-xs font-semibold text-muted-foreground" style={grpTh}>
                <div className="flex items-center justify-end gap-0.5">Preço Atual<SortBtn col="price" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} /></div>
              </th>
              <th className="sticky top-0 z-10 bg-card border-b border-border text-right px-1.5 py-2 text-xs font-semibold text-muted-foreground" style={grpTh}>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[10px] text-muted-foreground/60 font-normal">DPA Méd. ÷ {fatorInput || "8"}%</span>
                  <div className="flex items-center gap-0.5"><span>P. Teto</span><SortBtn col="precoTeto" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} /></div>
                </div>
              </th>
              <th className="sticky top-0 z-10 bg-card border-b border-border text-right px-1.5 py-2 text-xs font-semibold text-muted-foreground" style={grpTh}>
                <div className="flex items-center justify-end gap-0.5">DPA 12m<SortBtn col="dpa12m" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} /></div>
              </th>
              <th className="sticky top-0 z-10 bg-card border-b border-border text-right px-1.5 py-2 text-xs font-semibold text-muted-foreground" style={grpTh}>
                <div className="flex items-center justify-end gap-0.5">DL/EBIT<SortBtn col="dlEbitda" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} /></div>
              </th>
              <th className="sticky top-0 z-10 bg-card border-b border-border text-right px-1.5 py-2 text-xs font-semibold text-muted-foreground" style={grpTh}>
                <div className="flex items-center justify-end gap-0.5">Payout<SortBtn col="payout" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} /></div>
              </th>
              <th className="sticky top-0 z-10 bg-card border-b border-border text-right px-1.5 py-2 text-xs font-semibold text-muted-foreground" style={grpTh}>
                <div className="flex items-center justify-end gap-0.5">DY Atual<SortBtn col="dyAtual" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} /></div>
              </th>
              <th className="sticky top-0 z-10 bg-card border-b border-border text-right px-1.5 py-2 text-xs font-semibold text-muted-foreground" style={grpTh}>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[10px] text-muted-foreground/60 font-normal">6 anos</span>
                  <div className="flex items-center gap-0.5"><span>DY Méd.</span><SortBtn col="dyMedio" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} /></div>
                </div>
              </th>
              {years.map((y) => (
                <th key={y} className="sticky top-0 z-10 bg-card border-b border-border text-right px-1.5 py-2 text-[10px] font-semibold text-muted-foreground/50">
                  {y}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, i) => {
              const tetoOportunidade = row.precoTeto != null && row.precoTeto > row.price;

              return (
                <tr
                  key={row.symbol}
                  className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors cursor-pointer"
                  onClick={() => router.push(`/investments/indicators?symbol=${row.symbol}`)}
                >
                  <td className="px-1 py-1.5 text-xs text-muted-foreground text-center">{i + 1}</td>

                  <td className="px-1.5 py-1.5">
                    <div className="flex items-center gap-1.5">
                      {row.logourl ? (
                        <img src={row.logourl} alt={row.symbol}
                          className="h-5 w-5 rounded object-contain bg-secondary flex-shrink-0"
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div className="h-5 w-5 rounded flex items-center justify-center text-white font-bold text-[8px] flex-shrink-0"
                          style={{ backgroundColor: ACCENT }}>
                          {row.symbol.slice(0, 2)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-xs leading-tight">{row.symbol}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{row.shortName !== row.symbol ? row.shortName : row.sector}</p>
                      </div>
                    </div>
                  </td>

                  {/* Preço Atual — borda esquerda da moldura */}
                  <td className="px-1.5 py-1.5 text-right" style={grpTd}>
                    <span className="inline-block px-1 py-0.5 rounded text-xs font-bold"
                      style={tetoOportunidade
                        ? { backgroundColor: "rgba(34,197,94,0.15)", color: "#15803d" }
                        : { color: "var(--foreground)" }}>
                      {fmtBRL(row.price)}
                    </span>
                  </td>

                  {/* Preço Teto */}
                  <td className="px-1.5 py-1.5 text-right" style={grpTd}>
                    {row.precoTeto != null ? (
                      <span className="inline-block px-1 py-0.5 rounded text-xs font-bold"
                        style={tetoOportunidade
                          ? { backgroundColor: "rgba(34,197,94,0.15)", color: "#15803d" }
                          : { color: "var(--foreground)" }}>
                        {fmtBRL(row.precoTeto)}
                      </span>
                    ) : <span className="text-xs text-muted-foreground">–</span>}
                  </td>

                  {/* DPA 12m */}
                  <td className="px-1.5 py-1.5 text-right" style={grpTd}>
                    {row.dpa12m > 0
                      ? <span className="text-xs font-medium">{fmtBRL(row.dpa12m)}</span>
                      : <span className="text-xs text-muted-foreground">–</span>}
                  </td>

                  {/* DL/EBITDA */}
                  <td className="px-1.5 py-1.5 text-right" style={grpTd}>
                    {(() => {
                      const { netDebt, ebitda } = row;
                      if (netDebt == null || ebitda == null || ebitda === 0) return <span className="text-xs text-muted-foreground">–</span>;
                      const ratio = netDebt / ebitda;
                      const color = ratio < 0 ? "#16a34a" : ratio > 3 ? "#dc2626" : "inherit";
                      return <span className="text-xs font-medium" style={{ color }}>{ratio.toFixed(1).replace(".", ",")}x</span>;
                    })()}
                  </td>

                  {/* Payout */}
                  <td className="px-1.5 py-1.5 text-right" style={grpTd}>
                    {row.payoutRatio != null
                      ? <span className="text-xs font-medium" style={{ color: row.payoutRatio > 1 ? "#dc2626" : "inherit" }}>
                          {fmtPct(row.payoutRatio * 100)}
                        </span>
                      : <span className="text-xs text-muted-foreground">–</span>}
                  </td>

                  {/* DY Atual */}
                  <td className="px-1.5 py-1.5 text-right" style={grpTd}>
                    <DYCell dy={row.dyAtual} fator={fator} />
                  </td>

                  {/* DY Médio 6A */}
                  <td className="px-1.5 py-1.5 text-right" style={grpTd}>
                    {row.dyMedio != null && row.dyMedio > 0 ? (
                      <span className="inline-block px-1 py-0.5 rounded text-xs font-bold"
                        style={row.dyMedio >= fator * 100
                          ? { backgroundColor: "rgba(34,197,94,0.15)", color: "#15803d" }
                          : { color: "var(--foreground)" }}>
                        {fmtPct(row.dyMedio)}
                      </span>
                    ) : <span className="text-xs text-muted-foreground">–</span>}
                  </td>

                  {/* DY histórico por ano */}
                  {row.dyByYear.map((dy, yi) => (
                    <td key={years[yi]} className="px-1.5 py-1.5 text-right opacity-60">
                      <DYCell dy={dy} fator={fator} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground/40 text-right select-none">Fonte: Fundamentus</p>
    </div>
  );
}

"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, TrendingDown, Wallet, BarChart2,
  Loader2, AlertCircle, RefreshCw, Coins,
} from "lucide-react";
import {
  BarChart, Bar, XAxis as XAxisBar, YAxis as YAxisBar, CartesianGrid as CartesianGridBar,
  Tooltip as TooltipBar, ResponsiveContainer as RCBar, Cell as CellBar, Legend as LegendBar,
} from "recharts";
import { getSector } from "@/lib/investments/sectors";
import type { FixedIncomePosition } from "@/lib/investments/fixed-income-summary";
import { TIPO_LABELS, formatTaxaLabel } from "@/lib/investments/fixed-income-labels";

// ── Types ──────────────────────────────────────────────────────────────────────

type OrigemRecursos = "APORTE" | "REALOCACAO" | "PROVENTO";

type Operation = {
  id: string;
  symbol: string;
  company_name: string | null;
  operation_date: string;
  quantity: number;
  price: number;
  total: number;
  operation_type: "BUY" | "SELL";
  origem_recursos: OrigemRecursos | null;
  notes: string | null;
};

type Position = {
  symbol: string;
  company_name: string;
  logourl: string | null;
  sector: string | null;
  quantity: number;
  avgPrice: number;
  totalInvested: number;
  currentPrice: number;
  currentValue: number;
  gain: number;
  gainPercent: number;
  dividends12m: number;
  dpa12m: number;
  dy12m: number;
};

type Totals = {
  totalInvested: number;
  currentValue: number;
  gain: number;
  gainPercent: number;
  totalDividends12m: number;
  totalReturn: number;
  totalReturnPercent: number;
};

type FixedIncomeTotals = { totalPrincipal: number; totalAccruedInterest: number; totalCurrentValue: number };

type PortfolioData = {
  operations: Operation[];
  positions: Position[];
  totals: Totals;
  fixedIncome: { positions: FixedIncomePosition[]; totals: FixedIncomeTotals };
  isReadOnly: boolean;
  ownerName: string | null;
};

type DividendRow = { label: string; paymentDate: string; lastDatePrior: string; rate: number };

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCENT = "#3b82f6";
const CHART_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#14b8a6",
  "#6366f1", "#a78bfa",
];

const TABS = ["Posições", "Proventos", "Evolução"] as const;
type Tab = typeof TABS[number];

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const fmtPct = (v: number) =>
  `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
};

// ── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, positive, icon,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  icon: React.ReactNode;
}) {
  const iconBg = positive === undefined ? "rgba(59,130,246,0.1)" : positive ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)";
  const subColor = positive === undefined ? "var(--muted-foreground)" : positive ? "#16a34a" : "#dc2626";
  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 shadow-sm">
      {/* Mobile: compact single column; desktop: icon + content side by side */}
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: iconBg }}>
          <span className="[&>svg]:w-3.5 [&>svg]:h-3.5 sm:[&>svg]:w-5 sm:[&>svg]:h-5">{icon}</span>
        </div>
        <p className="text-[10px] sm:text-xs text-muted-foreground font-medium leading-tight">{label}</p>
      </div>
      <p className="text-sm sm:text-base font-bold text-foreground leading-tight break-all">{value}</p>
      {sub && (
        <p className="text-[10px] sm:text-xs font-semibold mt-0.5 truncate" style={{ color: subColor }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ── Donut center label ────────────────────────────────────────────────────────

function DonutCenter({ cx, cy, total }: { cx?: number; cy?: number; total: number }) {
  return (
    <g>
      <text x={cx} y={(cy ?? 0) - 8} textAnchor="middle" className="fill-muted-foreground" fontSize={11}>
        Valor atual
      </text>
      <text x={cx} y={(cy ?? 0) + 10} textAnchor="middle" fontSize={14} fontWeight={700} className="fill-foreground">
        {fmtBRL(total).replace("R$ ", "R$ ")}
      </text>
    </g>
  );
}

// ── Positions Tab ─────────────────────────────────────────────────────────────

function PositionsTab({
  positions, fixedIncomePositions,
}: {
  positions: Position[];
  fixedIncomePositions: FixedIncomePosition[];
}) {
  const hasStock = positions.length > 0;
  const hasFI = fixedIncomePositions.length > 0;

  if (!hasStock && !hasFI) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <Wallet className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Nenhuma posição. Adicione operações de compra.</p>
      </div>
    );
  }

  const pieValue = (p: Position) => p.currentValue > 0 ? p.currentValue : p.totalInvested;
  const stockPieData = positions.map((p, i) => ({
    id: p.symbol,
    name: p.symbol,
    sector: getSector(p.symbol, p.sector),
    value: pieValue(p),
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
  const stockPieTotal = stockPieData.reduce((s, d) => s + d.value, 0);

  const fiPieData = fixedIncomePositions.map((p, i) => ({
    id: p.id,
    name: p.institution ?? TIPO_LABELS[p.tipo],
    sector: TIPO_LABELS[p.tipo],
    value: p.currentValue,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
  const fiPieTotal = fiPieData.reduce((s, d) => s + d.value, 0);

  const totalDividends12m = positions.reduce((s, p) => s + p.dividends12m, 0);
  const hasDividends = totalDividends12m > 0;

  return (
    <div className="space-y-4">

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Ações ── */}
        <div className="space-y-4">
          {/* Donut chart */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Ações</p>
            {!hasStock ? (
              <p className="text-sm text-muted-foreground text-center py-10">Nenhuma posição em Ações.</p>
            ) : (
              <>
                <div className="relative">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={stockPieData} cx="50%" cy="50%" innerRadius={60} outerRadius={82}
                        dataKey="value" paddingAngle={2}>
                        {stockPieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} stroke="transparent" />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: unknown) => [fmtBRL(v as number), "Valor"]}
                        contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", backgroundColor: "var(--popover)", fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[11px] text-muted-foreground">Valor atual</span>
                    <span className="text-sm font-bold text-foreground">{fmtBRL(stockPieTotal)}</span>
                  </div>
                </div>
                {(() => {
                  const bySector: Record<string, typeof stockPieData> = {};
                  for (const d of stockPieData) {
                    (bySector[d.sector] ??= []).push(d);
                  }
                  return (
                    <div className="flex flex-col gap-3 mt-3">
                      {Object.entries(bySector).map(([sector, items]) => (
                        <div key={sector}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="h-px flex-1 bg-border" />
                            <span className="text-[10px] font-bold text-foreground uppercase tracking-widest px-1">{sector}</span>
                            <div className="h-px flex-1 bg-border" />
                          </div>
                          <div className="flex flex-col gap-1 pl-1">
                            {items.map((d) => (
                              <div key={d.id} className="flex items-center gap-2 min-w-0">
                                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                                <span className="text-xs font-semibold text-foreground flex-1">{d.name}</span>
                                <span className="text-xs text-muted-foreground flex-shrink-0 tabular-nums">
                                  {stockPieTotal > 0 ? `${((d.value / stockPieTotal) * 100).toFixed(1)}%` : "—"}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {/* Positions list */}
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Posições — Ações</p>
          </div>
          {!hasStock ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
              <p className="text-sm text-muted-foreground">Nenhuma posição em Ações.</p>
            </div>
          ) : (
          <div className="divide-y divide-border">
            {positions.map((p, i) => {
              const color = CHART_COLORS[i % CHART_COLORS.length];
              const hasPrice = p.currentPrice > 0;
              const isPos = p.gain >= 0;
              const totalReturn = (hasPrice ? p.gain : 0) + p.dividends12m;
              const totalReturnPct = p.totalInvested > 0 ? (totalReturn / p.totalInvested) * 100 : 0;
              return (
                <div key={p.symbol} className="px-4 py-3 hover:bg-secondary/30 transition-colors">
                  {/* Row 1: symbol + current value */}
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-sm font-bold text-foreground">{p.symbol}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {p.quantity.toLocaleString("pt-BR")} ações
                          </span>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="text-sm font-bold text-foreground">
                            {fmtBRL(hasPrice ? p.currentValue : p.totalInvested + p.dividends12m)}
                          </span>
                          {!hasPrice && (
                            <p className="text-[10px] text-muted-foreground">sem cotação</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Row 2: metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pl-11">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Custo</p>
                      <p className="text-xs font-semibold text-foreground">{fmtBRL(p.totalInvested)}</p>
                      <p className="text-[10px] text-muted-foreground">PM {fmtBRL(p.avgPrice)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Valorização</p>
                      {hasPrice ? (
                        <>
                          <p className="text-xs font-bold" style={{ color: isPos ? "#16a34a" : "#dc2626" }}>
                            {fmtBRL(p.gain)}
                          </p>
                          <p className="text-[10px]" style={{ color: isPos ? "#16a34a" : "#dc2626" }}>
                            {fmtPct(p.gainPercent)}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">—</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Proventos</p>
                      <p className="text-xs font-bold" style={{ color: hasDividends && p.dividends12m > 0 ? "#10b981" : "var(--muted-foreground)" }}>
                        {p.dividends12m > 0 ? fmtBRL(p.dividends12m) : "—"}
                      </p>
                      {p.dy12m > 0 && (
                        <p className="text-[10px]" style={{ color: "#10b981" }}>YOC {p.dy12m.toFixed(2)}%</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Retorno Total</p>
                      {hasPrice ? (
                        <>
                          <p className="text-xs font-bold" style={{ color: totalReturn >= 0 ? "#16a34a" : "#dc2626" }}>
                            {fmtBRL(totalReturn)}
                          </p>
                          <p className="text-[10px]" style={{ color: totalReturn >= 0 ? "#16a34a" : "#dc2626" }}>
                            {fmtPct(totalReturnPct)}
                          </p>
                        </>
                      ) : p.dividends12m > 0 ? (
                        <>
                          <p className="text-xs font-bold" style={{ color: "#10b981" }}>
                            {fmtBRL(p.dividends12m)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">só dividendos</p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">—</p>
                      )}
                    </div>
                  </div>
                  {/* Row 3: dual progress bar */}
                  <div className="pl-11 mt-2 flex gap-1 h-1.5">
                    {p.gain !== 0 && (
                      <div className="rounded-full overflow-hidden" style={{
                        flex: Math.abs(p.gain),
                        backgroundColor: isPos ? "rgba(22,163,74,0.2)" : "rgba(239,68,68,0.2)",
                      }}>
                        <div className="h-full rounded-full" style={{
                          width: "100%",
                          backgroundColor: isPos ? "#16a34a" : "#ef4444",
                          opacity: 0.8,
                        }} />
                      </div>
                    )}
                    {p.dividends12m > 0 && (
                      <div className="rounded-full overflow-hidden" style={{
                        flex: p.dividends12m,
                        backgroundColor: "rgba(16,185,129,0.2)",
                      }}>
                        <div className="h-full rounded-full" style={{ width: "100%", backgroundColor: "#10b981", opacity: 0.8 }} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}
          <p className="text-[10px] text-muted-foreground/40 text-right px-4 py-2 select-none">Fonte: Fundamentus</p>
          </div>
        </div>

        {/* ── Renda Fixa ── */}
        <div className="space-y-4">
          {/* Donut chart */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Renda Fixa</p>
            {!hasFI ? (
              <p className="text-sm text-muted-foreground text-center py-10">Nenhuma posição em Renda Fixa.</p>
            ) : (
              <>
                <div className="relative">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={fiPieData} cx="50%" cy="50%" innerRadius={60} outerRadius={82}
                        dataKey="value" paddingAngle={2}>
                        {fiPieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} stroke="transparent" />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: unknown) => [fmtBRL(v as number), "Valor"]}
                        contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", backgroundColor: "var(--popover)", fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[11px] text-muted-foreground">Valor atual</span>
                    <span className="text-sm font-bold text-foreground">{fmtBRL(fiPieTotal)}</span>
                  </div>
                </div>
                {(() => {
                  const byTipo: Record<string, typeof fiPieData> = {};
                  for (const d of fiPieData) {
                    (byTipo[d.sector] ??= []).push(d);
                  }
                  return (
                    <div className="flex flex-col gap-3 mt-3">
                      {Object.entries(byTipo).map(([tipo, items]) => (
                        <div key={tipo}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="h-px flex-1 bg-border" />
                            <span className="text-[10px] font-bold text-foreground uppercase tracking-widest px-1">{tipo}</span>
                            <div className="h-px flex-1 bg-border" />
                          </div>
                          <div className="flex flex-col gap-1 pl-1">
                            {items.map((d) => (
                              <div key={d.id} className="flex items-center gap-2 min-w-0">
                                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                                <span className="text-xs font-semibold text-foreground flex-1">{d.name}</span>
                                <span className="text-xs text-muted-foreground flex-shrink-0 tabular-nums">
                                  {fiPieTotal > 0 ? `${((d.value / fiPieTotal) * 100).toFixed(1)}%` : "—"}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {/* Positions list */}
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Posições — Renda Fixa</p>
            </div>
            {!hasFI ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                <p className="text-sm text-muted-foreground">Nenhuma posição em Renda Fixa.</p>
              </div>
            ) : (
            <div className="divide-y divide-border">
              {fixedIncomePositions.map((p) => {
                const days = daysUntil(p.maturity_date);
                return (
                  <div key={p.id} className="px-4 py-3 hover:bg-secondary/30 transition-colors">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="text-sm font-bold text-foreground">{TIPO_LABELS[p.tipo]}</span>
                            {p.institution && (
                              <span className="text-xs text-muted-foreground ml-2">{p.institution}</span>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className="text-sm font-bold text-foreground">{fmtBRL(p.currentValue)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pl-11">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Aplicado</p>
                        <p className="text-xs font-semibold text-foreground">{fmtBRL(p.principal)}</p>
                        <p className="text-[10px] text-muted-foreground">{fmtDate(p.application_date)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Indexador</p>
                        <p className="text-xs font-semibold text-foreground">{formatTaxaLabel(p.indexador, p.taxa)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Juros</p>
                        {p.interestUnavailable ? (
                          <p className="text-xs text-muted-foreground">indisponível</p>
                        ) : (
                          <>
                            <p className="text-xs font-bold" style={{ color: "#16a34a" }}>{fmtBRL(p.accruedInterest)}</p>
                            <p className="text-[10px]" style={{ color: "#16a34a" }}>{fmtPct(p.gainPercent)}</p>
                          </>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Vencimento</p>
                        <p className="text-xs font-semibold text-foreground">{fmtDate(p.maturity_date)}</p>
                        {p.isMatured ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(220,38,38,0.12)", color: "#dc2626" }}>Vencido</span>
                        ) : (
                          <p className="text-[10px] text-muted-foreground">{days}d restantes</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Proventos Tab ─────────────────────────────────────────────────────────────

type UpcomingDividend = {
  symbol: string;
  type: string;
  paymentDate: string;
  value: number;
  estimatedTotal: number | null;
  quantity: number | null;
};

const DIVIDEND_TYPE_LABELS: Record<string, string> = {
  DIVIDENDO: "Dividendo",
  JCP: "JCP",
  RENDIMENTO: "Rendimento",
  BONIFICACAO: "Bonificação",
};

function fmtPaymentDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function daysUntil(iso: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(iso + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function ProventosTab({ positions }: { positions: Position[] }) {
  const [selectedSymbol, setSelectedSymbol] = useState(positions[0]?.symbol ?? "");
  const [dividends, setDividends] = useState<DividendRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [upcoming, setUpcoming] = useState<UpcomingDividend[]>([]);
  const [loadingUpcoming, setLoadingUpcoming] = useState(true);

  const position = useMemo(() => positions.find((p) => p.symbol === selectedSymbol), [positions, selectedSymbol]);

  const fetchUpcoming = useCallback(async () => {
    setLoadingUpcoming(true);
    try {
      const res = await fetch("/api/investments/portfolio/upcoming-dividends");
      const data = await res.json();
      setUpcoming(data.upcoming ?? []);
    } finally {
      setLoadingUpcoming(false);
    }
  }, []);

  const fetchDividends = useCallback(async (sym: string) => {
    if (!sym) return;
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/investments/portfolio/dividends?symbol=${sym}`);
      const data = await res.json();
      setDividends(data.dividends ?? []);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { fetchUpcoming(); }, [fetchUpcoming]);

  useEffect(() => {
    if (selectedSymbol) fetchDividends(selectedSymbol);
  }, [selectedSymbol, fetchDividends]);

  if (!positions.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">Adicione operações para ver os proventos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Próximos Proventos */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Próximos Proventos</p>
            {upcoming.length > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: "rgba(16,185,129,0.12)", color: "#059669" }}>
                {upcoming.length} declarado{upcoming.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <button onClick={fetchUpcoming} disabled={loadingUpcoming}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${loadingUpcoming ? "animate-spin" : ""}`} />
          </button>
        </div>

        {loadingUpcoming ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : upcoming.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-muted-foreground">Nenhum provento declarado para os próximos dias.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/30">
                <tr className="border-b border-border">
                  {["Ativo", "Tipo", "Data Pagamento", "Dias", "Valor / Ação", "Estimativa"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-bold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {upcoming.map((u, i) => {
                  const days = daysUntil(u.paymentDate);
                  return (
                    <tr key={i} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-2.5 font-bold text-foreground">{u.symbol}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: "rgba(16,185,129,0.10)", color: "#059669" }}>
                          {DIVIDEND_TYPE_LABELS[u.type] ?? u.type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-sm font-semibold text-foreground whitespace-nowrap">
                        {fmtPaymentDate(u.paymentDate)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={days <= 7
                            ? { backgroundColor: "rgba(249,115,22,0.12)", color: "#c2410c" }
                            : days <= 30
                            ? { backgroundColor: "rgba(234,179,8,0.12)", color: "#a16207" }
                            : { backgroundColor: "rgba(59,130,246,0.10)", color: ACCENT }}>
                          {days === 0 ? "Hoje" : days === 1 ? "Amanhã" : `${days}d`}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-foreground">{fmtBRL(u.value)}</td>
                      <td className="px-4 py-2.5 font-bold" style={{ color: "#16a34a" }}>
                        {u.estimatedTotal != null ? fmtBRL(u.estimatedTotal) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Histórico por ativo */}
      <div className="flex items-center gap-3 flex-wrap">
        {positions.map((p) => (
          <button key={p.symbol} onClick={() => setSelectedSymbol(p.symbol)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all border"
            style={selectedSymbol === p.symbol
              ? { backgroundColor: ACCENT, color: "#fff", borderColor: ACCENT }
              : { borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
            {p.symbol}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
            Histórico de Proventos — {selectedSymbol}
          </p>
          {position && (
            <span className="text-xs text-muted-foreground">
              PM: <strong>{fmtBRL(position.avgPrice)}</strong> · {position.quantity.toLocaleString("pt-BR")} ações
            </span>
          )}
        </div>
        {loadingHistory ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : dividends.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <p className="text-sm text-muted-foreground">Sem dados de proventos para {selectedSymbol}.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/30">
                <tr className="border-b border-border">
                  {["Tipo", "Data Ex", "Pagamento", "R$/ação", "Total Recebido"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-bold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dividends.map((d, i) => {
                  const isPaid = d.paymentDate.slice(0, 10) <= new Date().toISOString().slice(0, 10);
                  const totalReceived = position ? d.rate * position.quantity : null;
                  const labelColor =
                    d.label === "DIVIDENDO"  ? { bg: "rgba(34,197,94,0.12)",  text: "#16a34a" } :
                    d.label === "JCP"        ? { bg: "rgba(59,130,246,0.12)", text: "#2563eb" } :
                                               { bg: "rgba(168,85,247,0.12)", text: "#7c3aed" };
                  return (
                    <tr key={i} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                          style={{ backgroundColor: labelColor.bg, color: labelColor.text }}>
                          {d.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {d.lastDatePrior
                          ? new Date(d.lastDatePrior).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" })
                          : "–"}
                      </td>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap"
                        style={{ color: isPaid ? "var(--muted-foreground)" : ACCENT, fontWeight: isPaid ? 400 : 600 }}>
                        {new Date(d.paymentDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" })}
                        {!isPaid && <span className="ml-1 text-[10px]">●</span>}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-foreground whitespace-nowrap">
                        {fmtBRL(d.rate)}
                      </td>
                      <td className="px-4 py-2.5 font-bold whitespace-nowrap" style={{ color: "#16a34a" }}>
                        {totalReceived !== null ? fmtBRL(totalReceived) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Evolução Tab ──────────────────────────────────────────────────────────────

const EVOL_KEYS = ["aporte", "realocacao", "provento", "rendaFixa", "valorizacao"] as const;
type EvolKey = typeof EVOL_KEYS[number];
const EVOL_COLORS: Record<EvolKey, string> = {
  aporte:      "#3b82f6",
  realocacao:  "#f97316",
  provento:    "#8b5cf6",
  rendaFixa:   "#65a30d",
  valorizacao: "#10b981",
};
const EVOL_LABELS: Record<EvolKey, string> = {
  aporte:      "Aporte",
  realocacao:  "Realocação",
  provento:    "Provento",
  rendaFixa:   "Renda Fixa",
  valorizacao: "Valorização",
};

const MONTH_ABBR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function EvolucaoTab({
  operations, totals, fixedIncomePositions, fixedIncomeTotals,
}: {
  operations: Operation[];
  totals: Totals;
  fixedIncomePositions: FixedIncomePosition[];
  fixedIncomeTotals: FixedIncomeTotals;
}) {
  const chartData = useMemo(() => {
    if (!operations.length && !fixedIncomePositions.length) return [];

    const state = { APORTE: 0, REALOCACAO: 0, PROVENTO: 0, RENDA_FIXA: 0 };
    const bySymbol: Record<string, { qty: number; cost: number }> = {};
    const byMonth: Record<string, { APORTE: number; REALOCACAO: number; PROVENTO: number; RENDA_FIXA: number }> = {};

    type TimelineEvent =
      | { date: string; kind: "stock"; op: Operation }
      | { date: string; kind: "fi"; principal: number };

    const events: TimelineEvent[] = [
      ...operations.map((op): TimelineEvent => ({ date: op.operation_date, kind: "stock", op })),
      ...fixedIncomePositions.map((p): TimelineEvent => ({ date: p.application_date, kind: "fi", principal: p.principal })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    for (const ev of events) {
      if (ev.kind === "stock") {
        const op = ev.op;
        if (op.operation_type === "BUY") {
          if (!bySymbol[op.symbol]) bySymbol[op.symbol] = { qty: 0, cost: 0 };
          bySymbol[op.symbol].qty += op.quantity;
          bySymbol[op.symbol].cost += op.total;
          const origin = (op.origem_recursos ?? "APORTE") as "APORTE" | "REALOCACAO" | "PROVENTO";
          state[origin] += op.total;
        } else {
          const sym = bySymbol[op.symbol];
          if (sym && sym.qty > 0) {
            const avgCost = sym.cost / sym.qty;
            const costOfSold = avgCost * Math.min(op.quantity, sym.qty);
            const totalInvested = state.APORTE + state.REALOCACAO + state.PROVENTO;
            if (totalInvested > 0) {
              const ratio = Math.min(costOfSold / totalInvested, 1);
              state.APORTE     = Math.max(0, state.APORTE     * (1 - ratio));
              state.REALOCACAO = Math.max(0, state.REALOCACAO * (1 - ratio));
              state.PROVENTO   = Math.max(0, state.PROVENTO   * (1 - ratio));
            }
            sym.qty  = Math.max(0, sym.qty - op.quantity);
            sym.cost = Math.max(0, sym.cost - costOfSold);
          }
        }
      } else {
        state.RENDA_FIXA += ev.principal;
      }
      const monthKey = ev.date.slice(0, 7);
      byMonth[monthKey] = { ...state };
    }

    const points = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, s]) => {
        const [y, m] = ym.split("-");
        return {
          date: `${MONTH_ABBR[parseInt(m) - 1]}/${y.slice(2)}`,
          aporte:      Math.round(s.APORTE),
          realocacao:  Math.round(s.REALOCACAO),
          provento:    Math.round(s.PROVENTO),
          rendaFixa:   Math.round(s.RENDA_FIXA),
          valorizacao: 0,
        };
      });

    const combinedCurrentValue = totals.currentValue + fixedIncomeTotals.totalCurrentValue;

    if (points.length > 0 && combinedCurrentValue > 0) {
      const lastMonthKey = Object.keys(byMonth).sort().pop()!;
      const todayKey = new Date().toISOString().slice(0, 7);
      const lastS = byMonth[lastMonthKey];
      const invested = lastS.APORTE + lastS.REALOCACAO + lastS.PROVENTO + lastS.RENDA_FIXA;
      const val = Math.max(0, Math.round(combinedCurrentValue - invested));

      if (todayKey > lastMonthKey) {
        points.push({
          date: "Hoje",
          aporte:      Math.round(lastS.APORTE),
          realocacao:  Math.round(lastS.REALOCACAO),
          provento:    Math.round(lastS.PROVENTO),
          rendaFixa:   Math.round(lastS.RENDA_FIXA),
          valorizacao: val,
        });
      } else {
        points[points.length - 1].valorizacao = val;
      }
    }

    return points;
  }, [operations, fixedIncomePositions, totals.currentValue, fixedIncomeTotals.totalCurrentValue]);

  if (!chartData.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">Adicione operações para ver a evolução.</p>
      </div>
    );
  }

  const last = chartData[chartData.length - 1];
  const grandTotal = EVOL_KEYS.reduce((s, k) => s + (last?.[k] ?? 0), 0);
  const tickInterval = chartData.length > 12 ? Math.floor(chartData.length / 8) : 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Evolução do Patrimônio por Origem</p>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
          {EVOL_KEYS.map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm inline-block flex-shrink-0" style={{ backgroundColor: EVOL_COLORS[k] }} />
              {EVOL_LABELS[k]}
            </span>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGridBar strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxisBar dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false}
            interval={tickInterval} />
          <YAxisBar tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false}
            tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} width={52} />
          <TooltipBar
            contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", backgroundColor: "#ffffff", fontSize: 12 }}
            labelStyle={{ color: "#111827" }}
            itemStyle={{ color: "#111827" }}
            formatter={(v: unknown, name: unknown) => [fmtBRL(v as number), EVOL_LABELS[name as EvolKey] ?? String(name)]} />
          <Bar dataKey="aporte"      name="aporte"      stackId="a" fill={EVOL_COLORS.aporte} />
          <Bar dataKey="realocacao"  name="realocacao"  stackId="a" fill={EVOL_COLORS.realocacao} />
          <Bar dataKey="provento"    name="provento"    stackId="a" fill={EVOL_COLORS.provento} />
          <Bar dataKey="rendaFixa"   name="rendaFixa"   stackId="a" fill={EVOL_COLORS.rendaFixa} />
          <Bar dataKey="valorizacao" name="valorizacao" stackId="a" fill={EVOL_COLORS.valorizacao} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-3 border-t border-border">
        {EVOL_KEYS.map((k) => {
          const value = last?.[k] ?? 0;
          return (
            <div key={k} className="text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <span className="w-2.5 h-2.5 rounded-sm inline-block flex-shrink-0" style={{ backgroundColor: EVOL_COLORS[k] }} />
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{EVOL_LABELS[k]}</p>
              </div>
              <p className="text-sm font-bold text-foreground">{fmtBRL(value)}</p>
              <p className="text-[10px] text-muted-foreground">
                {grandTotal > 0 ? `${((value / grandTotal) * 100).toFixed(1)}%` : "—"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function PortfolioClient() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("Posições");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/investments/portfolio");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao carregar carteira");
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // All hooks must run before any early return (Rules of Hooks)
  const { operations, positions, totals, fixedIncome, isReadOnly, ownerName } = data ?? {
    operations: [], positions: [],
    totals: { totalInvested: 0, currentValue: 0, gain: 0, gainPercent: 0, totalDividends12m: 0, totalReturn: 0, totalReturnPercent: 0 },
    fixedIncome: { positions: [], totals: { totalPrincipal: 0, totalAccruedInterest: 0, totalCurrentValue: 0 } },
    isReadOnly: false,
    ownerName: null,
  };

  // Combines Ações (stock) with Renda Fixa. Dividendos 12m stays stock-only: RF
  // juros already compounds into currentValue/gain here, so folding it into the
  // dividend card too would double-count it in Retorno Total.
  const combinedTotals = useMemo((): Totals => {
    const totalInvested = totals.totalInvested + fixedIncome.totals.totalPrincipal;
    const currentValue = totals.currentValue + fixedIncome.totals.totalCurrentValue;
    const gain = totals.gain + fixedIncome.totals.totalAccruedInterest;
    const gainPercent = totalInvested > 0 ? (gain / totalInvested) * 100 : 0;
    const totalDividends12m = totals.totalDividends12m;
    const totalReturn = gain + totalDividends12m;
    const totalReturnPercent = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;
    return { totalInvested, currentValue, gain, gainPercent, totalDividends12m, totalReturn, totalReturnPercent };
  }, [totals, fixedIncome.totals]);

  const isPos = combinedTotals.gain >= 0;
  const stockInvestedPct = combinedTotals.totalInvested > 0 ? (totals.totalInvested / combinedTotals.totalInvested) * 100 : 0;
  const fiInvestedPct = combinedTotals.totalInvested > 0 ? (fixedIncome.totals.totalPrincipal / combinedTotals.totalInvested) * 100 : 0;

  // Early returns after all hooks
  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center px-6">
        <AlertCircle className="h-10 w-10 text-red-500" />
        <p className="text-sm font-medium text-foreground">{error}</p>
        <button onClick={fetchData} className="px-4 py-2 rounded-lg text-sm font-semibold border border-border hover:bg-secondary/50 transition-colors">
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-4 max-w-6xl mx-auto">
      {/* Read-only banner */}
      {isReadOnly && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium"
          style={{ borderColor: `${ACCENT}4d`, backgroundColor: `${ACCENT}0d`, color: ACCENT }}>
          <span className="text-base">👁</span>
          Você está visualizando a carteira de <strong>{ownerName ?? "outro membro"}</strong> — somente leitura
        </div>
      )}
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <SummaryCard
          label="Total Investido"
          value={fmtBRL(combinedTotals.totalInvested)}
          sub={`${stockInvestedPct.toFixed(0)}% Ações · ${fiInvestedPct.toFixed(0)}% RF`}
          icon={<Wallet className="h-5 w-5" style={{ color: ACCENT }} />}
        />
        <SummaryCard
          label="Valor Atual"
          value={fmtBRL(combinedTotals.currentValue)}
          sub={isPos ? `+${fmtPct(combinedTotals.gainPercent)} valoriz.` : fmtPct(combinedTotals.gainPercent)}
          positive={combinedTotals.currentValue > 0 ? isPos : undefined}
          icon={isPos
            ? <TrendingUp className="h-5 w-5 text-emerald-500" />
            : <TrendingDown className="h-5 w-5 text-red-500" />}
        />
        <SummaryCard
          label="Dividendos 12m"
          value={fmtBRL(totals.totalDividends12m)}
          sub={totals.totalInvested > 0
            ? `DY ${((totals.totalDividends12m / totals.totalInvested) * 100).toFixed(2)}% s/ PM`
            : undefined}
          positive={totals.totalDividends12m > 0 ? true : undefined}
          icon={<Coins className="h-5 w-5 text-emerald-500" />}
        />
        <SummaryCard
          label="Valorização"
          value={fmtBRL(combinedTotals.gain)}
          sub={fmtPct(combinedTotals.gainPercent)}
          positive={isPos}
          icon={<BarChart2 className="h-5 w-5" style={{ color: isPos ? "#16a34a" : "#dc2626" }} />}
        />
        <SummaryCard
          label="Retorno Total"
          value={fmtBRL(combinedTotals.totalReturn)}
          sub={`${fmtPct(combinedTotals.totalReturnPercent)} (val. + div.)`}
          positive={combinedTotals.totalReturn >= 0}
          icon={combinedTotals.totalReturn >= 0
            ? <TrendingUp className="h-5 w-5 text-emerald-500" />
            : <TrendingDown className="h-5 w-5 text-red-500" />}
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-secondary/50 rounded-xl p-1">
          {TABS.map((t) => (
            <button key={t} onClick={() => setActiveTab(t)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={activeTab === t
                ? { backgroundColor: ACCENT, color: "#fff" }
                : { color: "var(--muted-foreground)" }}>
              {t}
            </button>
          ))}
        </div>
        <button onClick={fetchData}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "Posições" && (
        <PositionsTab positions={positions} fixedIncomePositions={fixedIncome.positions} />
      )}
      {activeTab === "Proventos" && <ProventosTab positions={positions} />}
      {activeTab === "Evolução" && (
        <EvolucaoTab
          operations={operations} totals={totals}
          fixedIncomePositions={fixedIncome.positions} fixedIncomeTotals={fixedIncome.totals}
        />
      )}
    </div>
  );
}

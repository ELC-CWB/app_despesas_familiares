"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useInvestmentFilters } from "@/contexts/investment-filters-context";
import { useSearchParams } from "next/navigation";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Loader2, TrendingUp, TrendingDown, AlertCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ───────────────────────────────────────────────────────────────────

interface HistoricalPoint {
  date: number;       // Unix timestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjustedClose?: number;
}

interface OperationMark {
  date: string;      // "YYYY-MM-DD"
  quantity: number;
  price: number;
  type: "BUY" | "SELL";
}

interface ChartData {
  symbol: string;
  shortName: string;
  logourl: string | null;
  currency: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  historicalDataPrice: HistoricalPoint[];
  operations: OperationMark[];
}

interface ChartsClientProps {
  symbols: string[];
}

// ─── Periods ─────────────────────────────────────────────────────────────────

const PERIODS = [
  { label: "1D",  range: "1d",   interval: "30m",  fmt: "time"    },
  { label: "5D",  range: "5d",   interval: "1h",   fmt: "dayTime" },
  { label: "1M",  range: "1mo",  interval: "1d",   fmt: "day"     },
  { label: "3M",  range: "3mo",  interval: "1d",   fmt: "day"     },
  { label: "1A",  range: "1y",   interval: "1wk",  fmt: "month"   },
  { label: "2A",  range: "2y",   interval: "1mo",  fmt: "month"   },
  { label: "5A",  range: "5y",   interval: "1mo",  fmt: "year"    },
  { label: "10A", range: "10y",  interval: "3mo",  fmt: "year"    },
] as const;

type PeriodFmt = typeof PERIODS[number]["fmt"];

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(n);
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2).replace(".", ",")}%`;
}

function fmtVal(n: number, sym: string) {
  if (sym.startsWith("^"))
    return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " pts";
  return fmtBRL(n);
}

function fmtAxisDate(ts: number, fmt: PeriodFmt): string {
  const d = new Date(ts * 1000);
  if (fmt === "time")    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (fmt === "dayTime") return `${d.getDate()}/${d.getMonth() + 1} ${d.getHours()}h`;
  if (fmt === "day")     return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  if (fmt === "month")   return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
  return String(d.getFullYear());
}

function fmtTooltipDate(ts: number, fmt: PeriodFmt): string {
  const d = new Date(ts * 1000);
  if (fmt === "time" || fmt === "dayTime")
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  if (fmt === "day")
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

function CustomTooltip({
  active, payload, fmt, buyMarks, symbol,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  fmt: PeriodFmt;
  buyMarks: Array<OperationMark & { ts: number; nearestDate: number }>;
  symbol: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as HistoricalPoint;
  const isUp = d.close >= d.open;
  const color = isUp ? "#22c55e" : "#ef4444";
  const fmt$ = (n: number) => fmtVal(n, symbol);

  // Find buy operations whose nearest chart point is this one
  const buysHere = buyMarks.filter((op) => op.nearestDate === d.date);

  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2.5 shadow-lg text-xs space-y-1 min-w-[160px]">
      <p className="text-muted-foreground font-medium">{fmtTooltipDate(d.date, fmt)}</p>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Fech.</span>
        <span className="font-bold" style={{ color }}>{fmt$(d.close)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Abert.</span>
        <span className="font-medium">{fmt$(d.open)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Máx.</span>
        <span className="font-medium text-green-600">{fmt$(d.high)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Mín.</span>
        <span className="font-medium text-red-500">{fmt$(d.low)}</span>
      </div>
      {d.volume > 0 && (
        <div className="flex justify-between gap-4 border-t border-border pt-1 mt-1">
          <span className="text-muted-foreground">Vol.</span>
          <span className="font-medium">{(d.volume / 1e6).toFixed(1).replace(".", ",")}M</span>
        </div>
      )}
      {buysHere.length > 0 && (
        <div className="border-t border-orange-200 pt-1.5 mt-1 space-y-1">
          {buysHere.map((op, i) => (
            <div key={i} className="flex justify-between gap-4">
              <span className="font-semibold" style={{ color: "#f97316" }}>
                ▲ Compra {op.date.slice(8)}/{op.date.slice(5, 7)}
              </span>
              <span className="font-semibold" style={{ color: "#f97316" }}>
                {op.quantity.toLocaleString("pt-BR")} × {fmtBRL(op.price)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

const ACCENT = "#3b82f6";

const BR_INDICES = [
  { symbol: "^BVSP", name: "Ibovespa" },
] as const;

export function ChartsClient({ symbols }: ChartsClientProps) {
  const searchParams = useSearchParams();
  const urlSymbol = searchParams.get("symbol")?.toUpperCase() ?? null;
  const { chartsSymbol, setChartsSymbol, chartsPeriodRange, setChartsPeriodRange,
          recentChartSymbols, addRecentChartSymbol } = useInvestmentFilters();

  const allSymbols = useMemo(() => {
    const base = urlSymbol && !symbols.includes(urlSymbol) ? [urlSymbol, ...symbols] : symbols;
    if (chartsSymbol && !base.includes(chartsSymbol)) return [chartsSymbol, ...base];
    return base;
  }, [symbols, urlSymbol, chartsSymbol]);

  const selectedSymbol = chartsSymbol || urlSymbol || "^BVSP";
  const setSelectedSymbol = (s: string) => setChartsSymbol(s);

  const selectedPeriod = PERIODS.find(p => p.range === chartsPeriodRange) ?? PERIODS[2];
  const setSelectedPeriod = (p: typeof PERIODS[number]) => setChartsPeriodRange(p.range);
  const [data, setData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [nameCache, setNameCache] = useState<Record<string, string>>({});
  const searchRef = useRef<HTMLDivElement>(null);

  const fetchChart = useCallback(async (symbol: string, period: typeof PERIODS[number]) => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const res = await fetch(
        `/api/investments/chart?symbol=${symbol}&range=${period.range}&interval=${period.interval}`
      );
      const json = await res.json();
      if (!res.ok) {
        setErrorCode(json.code ?? null);
        setError(json.detail ?? json.error ?? "Erro ao carregar gráfico");
        setData(null);
        return;
      }
      setData(json);
      setFetchedAt(new Date());
    } catch {
      setError("Erro de rede ao carregar gráfico");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSymbol) fetchChart(selectedSymbol, selectedPeriod);
  }, [selectedSymbol, selectedPeriod, fetchChart]);

  // Sync URL symbol to context on first load
  useEffect(() => {
    if (urlSymbol) setChartsSymbol(urlSymbol);
    else if (!chartsSymbol) setChartsSymbol("^BVSP");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cache company names as chart data loads
  useEffect(() => {
    if (data) setNameCache(prev => ({ ...prev, [data.symbol]: data.shortName }));
  }, [data]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node))
        setShowDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const queryUpper = searchQuery.trim().toUpperCase();
  const filteredSymbols = useMemo(() => {
    if (!queryUpper) return allSymbols;
    return allSymbols.filter(s =>
      s.includes(queryUpper) || (nameCache[s] ?? "").toUpperCase().includes(queryUpper)
    );
  }, [allSymbols, queryUpper, nameCache]);

  const filteredIndices = useMemo(() => {
    const q = queryUpper.replace("^", "");
    if (!q) return BR_INDICES;
    return BR_INDICES.filter(i =>
      i.symbol.replace("^", "").includes(q) || i.name.toUpperCase().includes(q)
    );
  }, [queryUpper]);

  // true when query looks like a valid ticker/index not already listed
  const showSearchOption =
    queryUpper.length >= 4 &&
    /^[A-Z]{3,4}[0-9]{1,2}$/.test(queryUpper) &&
    !allSymbols.includes(queryUpper) &&
    !BR_INDICES.some(i => i.symbol === queryUpper);

  const selectSymbol = (s: string) => {
    setSelectedSymbol(s);
    addRecentChartSymbol(s);
    setSearchQuery("");
    setShowDropdown(false);
  };

  // Prepare chart points
  const chartPoints = (data?.historicalDataPrice ?? [])
    .filter((p) => p.close > 0)
    .map((p) => ({
      ...p,
      dateLabel: fmtAxisDate(p.date, selectedPeriod.fmt),
    }));

  const firstClose = chartPoints[0]?.close ?? 0;
  const lastClose = chartPoints[chartPoints.length - 1]?.close ?? 0;
  const periodChange = firstClose > 0 ? lastClose - firstClose : 0;
  const periodChangePct = firstClose > 0 ? (periodChange / firstClose) * 100 : 0;
  const periodHigh = chartPoints.length > 0 ? Math.max(...chartPoints.map((p) => p.high)) : 0;
  const periodLow = chartPoints.length > 0 ? Math.min(...chartPoints.map((p) => p.low)) : 0;

  const isUp = periodChange >= 0;
  const lineColor = isUp ? "#22c55e" : "#ef4444";
  const gradientId = `grad-${selectedSymbol}`;

  // Y-axis domain with padding
  const prices = chartPoints.map((p) => p.close);
  const yMin = prices.length ? Math.min(...prices) * 0.995 : 0;
  const yMax = prices.length ? Math.max(...prices) * 1.005 : 100;

  // Map buy operations to nearest chart point (for ReferenceLine x value)
  const buyMarks = useMemo(() => {
    const ops = (data?.operations ?? []).filter((op) => op.type === "BUY");
    const pts = (data?.historicalDataPrice ?? []).filter((p) => p.close > 0);
    if (!ops.length || !pts.length) return [];
    const chartMin = pts[0].date;
    const chartMax = pts[pts.length - 1].date;

    return ops.flatMap((op) => {
      // Noon Brasília time to avoid day boundary issues
      const ts = new Date(op.date + "T12:00:00-03:00").getTime() / 1000;
      if (ts < chartMin - 86400 || ts > chartMax + 86400) return [];
      // Find nearest chart point
      let nearest = pts[0];
      let minDiff = Math.abs(nearest.date - ts);
      for (const p of pts) {
        const diff = Math.abs(p.date - ts);
        if (diff < minDiff) { minDiff = diff; nearest = p; }
      }
      return [{ ...op, ts, nearestDate: nearest.date }];
    });
  }, [data]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* Stock search */}
        <div className="relative w-full sm:w-64" ref={searchRef}>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
            <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              placeholder="Buscar código ou nome..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              onKeyDown={e => { if (e.key === "Enter" && queryUpper.length >= 4) selectSymbol(queryUpper); }}
              className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/50 min-w-0"
            />
            {selectedSymbol && !searchQuery && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-md text-white flex-shrink-0" style={{ backgroundColor: ACCENT }}>
                {selectedSymbol}
              </span>
            )}
          </div>

          {showDropdown && (() => {
            const isSearching = queryUpper.length > 0;
            const listToShow = isSearching ? filteredSymbols : recentChartSymbols;
            const hasItems = listToShow.length > 0 || filteredIndices.length > 0 || showSearchOption;
            if (!hasItems) return null;
            return (
              <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                {!isSearching && recentChartSymbols.length > 0 && (
                  <div className="px-3 py-1.5 border-b border-border">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Recentes</span>
                  </div>
                )}
                {listToShow.map(s => (
                  <button
                    key={s}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary/60 transition-colors"
                    style={selectedSymbol === s ? { backgroundColor: "rgba(59,130,246,0.07)" } : {}}
                    onMouseDown={() => selectSymbol(s)}
                  >
                    <span className="text-sm font-semibold text-foreground">{s}</span>
                    {nameCache[s] && (
                      <span className="text-xs text-muted-foreground truncate">{nameCache[s]}</span>
                    )}
                    {selectedSymbol === s && (
                      <span className="ml-auto text-[10px] font-semibold flex-shrink-0" style={{ color: ACCENT }}>✓</span>
                    )}
                  </button>
                ))}
                {filteredIndices.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 border-t border-border bg-secondary/20">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Índices de Mercado</span>
                    </div>
                    {filteredIndices.map(idx => (
                      <button
                        key={idx.symbol}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary/60 transition-colors"
                        style={selectedSymbol === idx.symbol ? { backgroundColor: "rgba(59,130,246,0.07)" } : {}}
                        onMouseDown={() => selectSymbol(idx.symbol)}
                      >
                        <span className="text-sm font-semibold text-foreground">{idx.symbol}</span>
                        <span className="text-xs text-muted-foreground truncate">{idx.name}</span>
                        {selectedSymbol === idx.symbol && (
                          <span className="ml-auto text-[10px] font-semibold flex-shrink-0" style={{ color: ACCENT }}>✓</span>
                        )}
                      </button>
                    ))}
                  </>
                )}
                {showSearchOption && (
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary/60 transition-colors border-t border-border"
                    onMouseDown={() => selectSymbol(queryUpper)}
                  >
                    <Search className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Abrir gráfico para</span>
                    <span className="text-sm font-bold text-foreground">{queryUpper}</span>
                  </button>
                )}
              </div>
            );
          })()}
        </div>

        {/* Period selector */}
        <div className="flex gap-1 bg-secondary/50 rounded-lg p-1 flex-wrap">
          {PERIODS.map((p) => (
            <button
              key={p.label}
              onClick={() => setSelectedPeriod(p)}
              className="px-2.5 py-1 rounded-md text-xs font-semibold transition-all"
              style={
                selectedPeriod.range === p.range
                  ? { backgroundColor: ACCENT, color: "#fff" }
                  : { color: "var(--muted-foreground)" }
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart card */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
        {/* Header stats */}
        {data && !loading && (
          <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-base font-semibold text-foreground leading-tight">{data.shortName}</p>
                <p className="text-[11px] text-muted-foreground mb-1">{data.symbol}</p>
                <p className="text-2xl font-bold text-foreground">{fmtVal(data.regularMarketPrice, data.symbol)}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {isUp
                    ? <TrendingUp className="h-3.5 w-3.5" style={{ color: lineColor }} />
                    : <TrendingDown className="h-3.5 w-3.5" style={{ color: lineColor }} />}
                  <span className="text-sm font-semibold" style={{ color: lineColor }}>
                    {fmtVal(Math.abs(periodChange), data.symbol)} ({fmtPct(periodChangePct)}) no período
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-6 text-right items-start">
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Máx. período</p>
                <p className="text-sm font-semibold text-green-600">{fmtVal(periodHigh, data.symbol)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Mín. período</p>
                <p className="text-sm font-semibold text-red-500">{fmtVal(periodLow, data.symbol)}</p>
              </div>
              {buyMarks.length > 0 && (
                <div className="flex flex-col items-center">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Compras</p>
                  <div className="flex items-center gap-1.5">
                    <svg width="14" height="10" viewBox="0 0 14 10">
                      <line x1="7" y1="0" x2="7" y2="10" stroke="#f97316" strokeWidth="1.5" strokeDasharray="4 2" />
                      <polygon points="3,2 11,2 7,8" fill="#f97316" />
                    </svg>
                    <p className="text-sm font-semibold" style={{ color: "#f97316" }}>{buyMarks.length}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center h-72 gap-2">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: ACCENT }} />
            <span className="text-sm text-muted-foreground">Carregando gráfico...</span>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex items-center gap-2 h-72 justify-center text-center px-4">
            <div className="space-y-2">
              <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
              {errorCode === "INVALID_RANGE" ? (
                <>
                  <p className="text-sm font-medium text-foreground">Período não disponível para {selectedSymbol}</p>
                  <p className="text-xs text-muted-foreground">
                    Este ativo não possui dados históricos para o período selecionado.<br />
                    Tente um período menor.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{error}</p>
              )}
              {errorCode !== "INVALID_RANGE" && (
                <Button size="sm" variant="outline" onClick={() => fetchChart(selectedSymbol, selectedPeriod)}>
                  Tentar novamente
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Chart */}
        {!loading && !error && chartPoints.length > 0 && (
          <div style={{ WebkitTapHighlightColor: "transparent" }}>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={chartPoints} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={lineColor} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={lineColor} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" vertical={false} />
                <XAxis
                  dataKey="date"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  tickFormatter={(v) => fmtAxisDate(v as number, selectedPeriod.fmt)}
                />
                <YAxis
                  domain={[yMin, yMax]}
                  tickFormatter={(v) => `${v.toFixed(2).replace(".", ",")}`}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={62}
                />
                <Tooltip
                  content={<CustomTooltip fmt={selectedPeriod.fmt} buyMarks={buyMarks} symbol={selectedSymbol} />}
                  cursor={{ stroke: "rgba(128,128,128,0.3)", strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke={lineColor}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }}
                />
                {buyMarks.map((op, i) => (
                  <ReferenceLine
                    key={i}
                    x={op.nearestDate}
                    stroke="#f97316"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    label={({ viewBox }) => {
                      const vb = viewBox as { x?: number; y?: number };
                      if (vb?.x == null || vb?.y == null) return null;
                      return (
                        <g>
                          <polygon
                            points={`${vb.x - 4},${vb.y + 2} ${vb.x + 4},${vb.y + 2} ${vb.x},${vb.y + 9}`}
                            fill="#f97316"
                          />
                        </g>
                      );
                    }}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {!loading && !error && chartPoints.length === 0 && data && (
          <div className="flex items-center justify-center h-72 text-sm text-muted-foreground">
            Sem dados históricos para o período selecionado.
          </div>
        )}
        <p className="text-[10px] text-muted-foreground/40 text-right mt-2 select-none">
          Fonte: Yahoo Finance{fetchedAt ? ` · ${fetchedAt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}
        </p>
      </div>
    </div>
  );
}

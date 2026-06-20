"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Loader2, TrendingUp, TrendingDown, AlertCircle, BarChart2 } from "lucide-react";
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

interface ChartData {
  symbol: string;
  shortName: string;
  currency: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  historicalDataPrice: HistoricalPoint[];
}

interface ChartsClientProps {
  symbols: string[];
}

// ─── Periods ─────────────────────────────────────────────────────────────────

const PERIODS = [
  { label: "1D",  range: "1d",   interval: "30m",  fmt: "time"   },
  { label: "5D",  range: "5d",   interval: "1h",   fmt: "dayTime" },
  { label: "1M",  range: "1mo",  interval: "1d",   fmt: "day"    },
  { label: "3M",  range: "3mo",  interval: "1d",   fmt: "day"    },
  { label: "1A",  range: "1y",   interval: "1wk",  fmt: "month"  },
  { label: "2A",  range: "2y",   interval: "1mo",  fmt: "month"  },
  { label: "5A",  range: "5y",   interval: "1mo",  fmt: "year"   },
  { label: "10A", range: "10y",  interval: "3mo",  fmt: "year"   },
] as const;

type PeriodFmt = typeof PERIODS[number]["fmt"];

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(n);
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2).replace(".", ",")}%`;
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
  active, payload, fmt,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  fmt: PeriodFmt;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as HistoricalPoint & { dateLabel: string };
  const isUp = d.close >= d.open;
  const color = isUp ? "#22c55e" : "#ef4444";

  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2.5 shadow-lg text-xs space-y-1 min-w-[160px]">
      <p className="text-muted-foreground font-medium">{fmtTooltipDate(d.date, fmt)}</p>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Fech.</span>
        <span className="font-bold" style={{ color }}>{fmtBRL(d.close)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Abert.</span>
        <span className="font-medium">{fmtBRL(d.open)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Máx.</span>
        <span className="font-medium text-green-600">{fmtBRL(d.high)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Mín.</span>
        <span className="font-medium text-red-500">{fmtBRL(d.low)}</span>
      </div>
      {d.volume > 0 && (
        <div className="flex justify-between gap-4 border-t border-border pt-1 mt-1">
          <span className="text-muted-foreground">Vol.</span>
          <span className="font-medium">{(d.volume / 1e6).toFixed(1).replace(".", ",")}M</span>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

const ACCENT = "#3b82f6";

export function ChartsClient({ symbols }: ChartsClientProps) {
  const [selectedSymbol, setSelectedSymbol] = useState<string>(symbols[0] ?? "");
  const [selectedPeriod, setSelectedPeriod] = useState(PERIODS[2]); // 1M default
  const [data, setData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchChart = useCallback(async (symbol: string, period: typeof PERIODS[number]) => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/investments/chart?symbol=${symbol}&range=${period.range}&interval=${period.interval}`
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.detail ?? json.error ?? "Erro ao carregar gráfico");
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setError("Erro de rede ao carregar gráfico");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSymbol) fetchChart(selectedSymbol, selectedPeriod);
  }, [selectedSymbol, selectedPeriod, fetchChart]);

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

  if (symbols.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center px-6">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(59,130,246,0.1)" }}>
          <BarChart2 className="w-7 h-7" style={{ color: ACCENT }} />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Nenhum ativo na carteira</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Adicione ativos na aba <strong>Cotações</strong> para visualizar gráficos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* Stock selector */}
        <div className="flex flex-wrap gap-2">
          {symbols.map((s) => (
            <button
              key={s}
              onClick={() => setSelectedSymbol(s)}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
              style={
                selectedSymbol === s
                  ? { backgroundColor: ACCENT, color: "#fff" }
                  : { backgroundColor: "transparent", color: "var(--muted-foreground)", border: "1px solid var(--border)" }
              }
            >
              {s}
            </button>
          ))}
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
            <div>
              <p className="text-xs text-muted-foreground">{data.shortName}</p>
              <p className="text-2xl font-bold text-foreground">{fmtBRL(data.regularMarketPrice)}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {isUp
                  ? <TrendingUp className="h-3.5 w-3.5" style={{ color: lineColor }} />
                  : <TrendingDown className="h-3.5 w-3.5" style={{ color: lineColor }} />}
                <span className="text-sm font-semibold" style={{ color: lineColor }}>
                  {fmtBRL(Math.abs(periodChange))} ({fmtPct(periodChangePct)}) no período
                </span>
              </div>
            </div>
            <div className="flex gap-6 text-right">
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Máx. período</p>
                <p className="text-sm font-semibold text-green-600">{fmtBRL(periodHigh)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Mín. período</p>
                <p className="text-sm font-semibold text-red-500">{fmtBRL(periodLow)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Pontos</p>
                <p className="text-sm font-semibold text-foreground">{chartPoints.length}</p>
              </div>
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
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button size="sm" variant="outline" onClick={() => fetchChart(selectedSymbol, selectedPeriod)}>
                Tentar novamente
              </Button>
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
                  dataKey="dateLabel"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
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
                  content={<CustomTooltip fmt={selectedPeriod.fmt} />}
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
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {!loading && !error && chartPoints.length === 0 && data && (
          <div className="flex items-center justify-center h-72 text-sm text-muted-foreground">
            Sem dados históricos para o período selecionado.
          </div>
        )}
      </div>
    </div>
  );
}

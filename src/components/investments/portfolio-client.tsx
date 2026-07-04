"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, TrendingDown, Wallet, BarChart2, Plus, Trash2,
  ChevronDown, Loader2, AlertCircle, CalendarDays, RefreshCw, Coins,
} from "lucide-react";
import {
  BarChart, Bar, XAxis as XAxisBar, YAxis as YAxisBar, CartesianGrid as CartesianGridBar,
  Tooltip as TooltipBar, ResponsiveContainer as RCBar, Cell as CellBar, Legend as LegendBar,
} from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getSector } from "@/lib/investments/sectors";

// ── Types ──────────────────────────────────────────────────────────────────────

type OrigemRecursos = "APORTE" | "REALOCACAO" | "PROVENTO";

const ORIGEM_LABELS: Record<OrigemRecursos, string> = {
  APORTE:     "Aporte",
  REALOCACAO: "Realocação",
  PROVENTO:   "Provento",
};

const ORIGEM_COLORS: Record<OrigemRecursos, { bg: string; text: string }> = {
  APORTE:     { bg: "rgba(59,130,246,0.10)",  text: "#2563eb" },
  REALOCACAO: { bg: "rgba(249,115,22,0.10)",  text: "#c2410c" },
  PROVENTO:   { bg: "rgba(139,92,246,0.10)",  text: "#7c3aed" },
};

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

type PortfolioData = {
  operations: Operation[];
  positions: Position[];
  totals: Totals;
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

const TABS = ["Posições", "Operações", "Proventos", "Evolução"] as const;
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

// ── Operation Dialog (add + edit) ────────────────────────────────────────────

function OperationDialog({
  open, onClose, onSaved, initialOp,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialOp?: Operation;
}) {
  const isEdit = !!initialOp;

  const blankForm = {
    symbol: "",
    operation_date: new Date().toISOString().slice(0, 10),
    quantity: "",
    price: "",
    operation_type: "BUY" as "BUY" | "SELL",
    origem_recursos: "APORTE" as OrigemRecursos,
    notes: "",
  };

  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // Populate form when editing
  useEffect(() => {
    if (open) {
      if (initialOp) {
        setForm({
          symbol: initialOp.symbol,
          operation_date: initialOp.operation_date,
          quantity: String(initialOp.quantity),
          price: String(initialOp.price),
          operation_type: initialOp.operation_type,
          origem_recursos: initialOp.origem_recursos ?? "APORTE",
          notes: initialOp.notes ?? "",
        });
      } else {
        setForm(blankForm);
      }
      setErr("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialOp?.id]);

  const total = useMemo(() => {
    const q = parseFloat(String(form.quantity).replace(",", "."));
    const p = parseFloat(String(form.price).replace(",", "."));
    return isNaN(q) || isNaN(p) ? null : q * p;
  }, [form.quantity, form.price]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setErr("");
    const sym = form.symbol.trim().toUpperCase();
    const qty = parseFloat(String(form.quantity).replace(",", "."));
    const prc = parseFloat(String(form.price).replace(",", "."));
    if (!sym || isNaN(qty) || qty <= 0 || isNaN(prc) || prc <= 0 || !form.operation_date)
      return setErr("Preencha todos os campos obrigatórios.");
    setSaving(true);
    try {
      const url = isEdit ? `/api/investments/portfolio?id=${initialOp!.id}` : "/api/investments/portfolio";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym, operation_date: form.operation_date, quantity: qty, price: prc, operation_type: form.operation_type, origem_recursos: form.origem_recursos, notes: form.notes || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erro ao salvar");
      onSaved();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">{isEdit ? "Editar Operação" : "Nova Operação"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          {/* BUY / SELL toggle */}
          <div className="flex rounded-lg overflow-hidden border border-border">
            {(["BUY", "SELL"] as const).map((t) => (
              <button key={t} onClick={() => set("operation_type", t)}
                className="flex-1 py-2 text-sm font-semibold transition-colors"
                style={form.operation_type === t
                  ? { backgroundColor: t === "BUY" ? "#16a34a" : "#dc2626", color: "#fff" }
                  : { color: "var(--muted-foreground)" }}>
                {t === "BUY" ? "Compra" : "Venda"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Código *</label>
              <input className={inputCls} placeholder="ex: PETR4" value={form.symbol}
                onChange={(e) => set("symbol", e.target.value.toUpperCase())} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Data *</label>
              <input type="date" className={inputCls} value={form.operation_date}
                onChange={(e) => set("operation_date", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Origem dos Recursos</label>
              <select className={inputCls} value={form.origem_recursos}
                onChange={(e) => set("origem_recursos", e.target.value)}>
                {(Object.entries(ORIGEM_LABELS) as [OrigemRecursos, string][]).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Quantidade *</label>
              <input className={inputCls} placeholder="ex: 100" value={form.quantity}
                onChange={(e) => set("quantity", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Preço (R$) *</label>
              <input className={inputCls} placeholder="ex: 37,50" value={form.price}
                onChange={(e) => set("price", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Total</label>
              <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2 text-sm font-semibold text-muted-foreground">
                {total !== null ? fmtBRL(total) : "—"}
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Observações</label>
            <input className={inputCls} placeholder="Opcional" value={form.notes}
              onChange={(e) => set("notes", e.target.value)} />
          </div>
          {err && <p className="text-xs text-red-500 font-medium">{err}</p>}
        </div>
        <DialogFooter className="gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold border border-border hover:bg-secondary/50 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-2 transition-colors"
            style={{ backgroundColor: ACCENT }}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isEdit ? "Salvar alterações" : "Salvar"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Positions Tab ─────────────────────────────────────────────────────────────

function PositionsTab({ positions, totals }: { positions: Position[]; totals: Totals }) {
  if (!positions.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <Wallet className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Nenhuma posição. Adicione operações de compra.</p>
      </div>
    );
  }

  const pieValue = (p: Position) => p.currentValue > 0 ? p.currentValue : p.totalInvested;
  const pieTotal = positions.reduce((s, p) => s + pieValue(p), 0);
  const pieData = positions.map((p, i) => ({
    name: p.symbol,
    sector: getSector(p.symbol, p.sector),
    value: pieValue(p),
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const totalDividends12m = positions.reduce((s, p) => s + p.dividends12m, 0);
  const hasDividends = totalDividends12m > 0;

  return (
    <div className="space-y-4">

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Donut chart */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Diversificação</p>
          <div className="relative">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={82}
                  dataKey="value" paddingAngle={2}>
                  {pieData.map((entry, i) => (
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
              <span className="text-sm font-bold text-foreground">{fmtBRL(totals.currentValue)}</span>
            </div>
          </div>
          {(() => {
            const bySector: Record<string, typeof pieData> = {};
            for (const d of pieData) {
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
                        <div key={d.name} className="flex items-center gap-2 min-w-0">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                          <span className="text-xs font-semibold text-foreground flex-1">{d.name}</span>
                          <span className="text-xs text-muted-foreground flex-shrink-0 tabular-nums">
                            {pieTotal > 0 ? `${((d.value / pieTotal) * 100).toFixed(1)}%` : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Positions list */}
        <div className="lg:col-span-3 rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Posições</p>
          </div>
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
                    {p.logourl ? (
                      <img src={p.logourl} alt={p.symbol} className="w-8 h-8 rounded-lg object-contain bg-secondary flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
                        style={{ backgroundColor: color }}>
                        {p.symbol.slice(0, 2)}
                      </div>
                    )}
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
          <p className="text-[10px] text-muted-foreground/40 text-right px-4 py-2 select-none">Fonte: Fundamentus</p>
        </div>
      </div>
    </div>
  );
}

// ── Operations Tab ────────────────────────────────────────────────────────────

function OperationsTab({
  operations, onDelete, onAdd, onRefresh, isReadOnly,
  filterSymbol, filterType, filterOrigem, filterDateFrom, filterDateTo,
  setFilterSymbol, setFilterType, setFilterOrigem, setFilterDateFrom, setFilterDateTo,
}: {
  operations: Operation[];
  onDelete: (id: string) => void;
  onAdd: () => void;
  onRefresh: () => void;
  isReadOnly: boolean;
  filterSymbol: string;
  filterType: "ALL" | "BUY" | "SELL";
  filterOrigem: "ALL" | OrigemRecursos;
  filterDateFrom: string;
  filterDateTo: string;
  setFilterSymbol: (v: string) => void;
  setFilterType: (v: "ALL" | "BUY" | "SELL") => void;
  setFilterOrigem: (v: "ALL" | OrigemRecursos) => void;
  setFilterDateFrom: (v: string) => void;
  setFilterDateTo: (v: string) => void;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingOp, setEditingOp] = useState<Operation | null>(null);
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);

  const symbols = useMemo(() => Array.from(new Set(operations.map((o) => o.symbol))).sort(), [operations]);

  const runningAvg = useMemo(() => {
    const state: Record<string, { cost: number; qty: number }> = {};
    return operations.map((op) => {
      if (!state[op.symbol]) state[op.symbol] = { cost: 0, qty: 0 };
      if (op.operation_type === "BUY") {
        state[op.symbol].cost += op.total;
        state[op.symbol].qty += op.quantity;
      } else {
        const avg = state[op.symbol].qty > 0 ? state[op.symbol].cost / state[op.symbol].qty : 0;
        state[op.symbol].qty -= op.quantity;
        state[op.symbol].cost -= avg * op.quantity;
      }
      const qty = state[op.symbol].qty;
      return qty > 0.0001 ? state[op.symbol].cost / qty : 0;
    });
  }, [operations]);

  const filtered = useMemo(() => {
    return operations
      .map((op, i) => ({ op, avgIdx: i }))
      .filter(({ op }) => {
        if (filterSymbol !== "TODOS" && op.symbol !== filterSymbol) return false;
        if (filterType !== "ALL" && op.operation_type !== filterType) return false;
        if (filterOrigem !== "ALL" && op.origem_recursos !== filterOrigem) return false;
        if (filterDateFrom && op.operation_date < filterDateFrom) return false;
        if (filterDateTo && op.operation_date > filterDateTo) return false;
        return true;
      })
      .reverse();
  }, [operations, filterSymbol, filterType, filterOrigem, filterDateFrom, filterDateTo]);

  const hasFilters = filterSymbol !== "TODOS" || filterType !== "ALL" || filterOrigem !== "ALL" || filterDateFrom || filterDateTo;

  const clearFilters = () => {
    setFilterSymbol("TODOS");
    setFilterType("ALL");
    setFilterOrigem("ALL");
    setFilterDateFrom("");
    setFilterDateTo("");
  };

  const toggleFilter = (key: string, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (openFilter === key) { setOpenFilter(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    setOpenFilter(key);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setOpenFilter(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Remover esta operação?")) return;
    setDeleting(id);
    await fetch(`/api/investments/portfolio?id=${id}`, { method: "DELETE" });
    onDelete(id);
    setDeleting(null);
  };

  // Helper: filterable column header button
  const FilterTh = ({
    colKey, label, active, align = "left",
  }: { colKey: string; label: string; active: boolean; align?: "left" | "right" }) => (
    <th className={`px-3 py-2.5 text-${align} whitespace-nowrap`}>
      <button
        onClick={(e) => toggleFilter(colKey, e)}
        className="inline-flex items-center gap-1 text-xs font-bold transition-colors"
        style={{ color: active ? ACCENT : "var(--muted-foreground)" }}
      >
        {label}
        <ChevronDown
          className="h-3 w-3 transition-transform"
          style={{ transform: openFilter === colKey ? "rotate(180deg)" : "rotate(0deg)", color: active ? ACCENT : undefined }}
        />
      </button>
    </th>
  );

  const inputCls = "w-full rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30";

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Registro das Operações</p>
          {hasFilters && (
            <button onClick={clearFilters}
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors"
              style={{ borderColor: ACCENT, color: ACCENT }}>
              Limpar filtros
            </button>
          )}
          {operations.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {filtered.length}/{operations.length}
            </span>
          )}
        </div>
        {!isReadOnly && (
          <button onClick={onAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors"
            style={{ backgroundColor: ACCENT }}>
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </button>
        )}
      </div>

      {!operations.length ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
          <CalendarDays className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Nenhuma operação registrada.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/30">
              <tr className="border-b border-border">
                <FilterTh colKey="data"   label="Data"   active={!!(filterDateFrom || filterDateTo)} />
                <FilterTh colKey="tipo"   label="Tipo"   active={filterType !== "ALL"} />
                <FilterTh colKey="codigo" label="Código" active={filterSymbol !== "TODOS"} />
                <FilterTh colKey="origem" label="Origem" active={filterOrigem !== "ALL"} />
                {(["Qtd", "Preço", "Total", "PM Acum."] as const).map((h) => (
                  <th key={h} className="px-3 py-2.5 text-right text-xs font-bold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Nenhuma operação com os filtros aplicados.{" "}
                    <button onClick={clearFilters} className="underline hover:text-foreground">Limpar</button>
                  </td>
                </tr>
              ) : filtered.map(({ op, avgIdx }) => (
                <tr key={op.id}
                  className={`hover:bg-secondary/30 transition-colors ${!isReadOnly ? "cursor-pointer" : ""}`}
                  style={{ borderLeft: `3px solid ${op.operation_type === "BUY" ? "#16a34a" : "#dc2626"}` }}
                  onClick={() => !isReadOnly && setEditingOp(op)}>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(op.operation_date)}</td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={op.operation_type === "BUY"
                        ? { backgroundColor: "rgba(22,163,74,0.12)", color: "#16a34a" }
                        : { backgroundColor: "rgba(220,38,38,0.12)", color: "#dc2626" }}>
                      {op.operation_type === "BUY" ? "Compra" : "Venda"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-bold text-foreground">{op.symbol}</td>
                  <td className="px-3 py-2.5">
                    {op.origem_recursos ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                        style={ORIGEM_COLORS[op.origem_recursos]}>
                        {ORIGEM_LABELS[op.origem_recursos]}
                      </span>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">{op.quantity.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2.5 text-right">{fmtBRL(op.price)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">{fmtBRL(op.total)}</td>
                  <td className="px-3 py-2.5 text-right font-bold"
                    style={{ backgroundColor: "rgba(251,191,36,0.06)", color: "#b45309" }}>
                    {runningAvg[avgIdx] > 0 ? fmtBRL(runningAvg[avgIdx]) : "—"}
                  </td>
                  <td className="px-2 w-8" onClick={(e) => e.stopPropagation()}>
                    {!isReadOnly && (
                      <button onClick={() => handleDelete(op.id)} disabled={deleting === op.id}
                        className="p-1 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
                        {deleting === op.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Floating filter dropdown (fixed positioning to escape overflow) */}
      {openFilter && (
        <div ref={dropdownRef}
          className="fixed z-50 bg-popover border border-border rounded-xl shadow-xl p-3"
          style={{ top: dropdownPos.top, left: dropdownPos.left, minWidth: 220 }}>

          {openFilter === "data" && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Período</p>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">De</label>
                <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="w-full rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-xs focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Até</label>
                <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
                  className="w-full rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-xs focus:outline-none" />
              </div>
              {(filterDateFrom || filterDateTo) && (
                <button onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground underline mt-1">Limpar</button>
              )}
            </div>
          )}

          {openFilter === "tipo" && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Tipo</p>
              {([["ALL", "Todos"], ["BUY", "Compra"], ["SELL", "Venda"]] as const).map(([v, label]) => (
                <button key={v} onClick={() => { setFilterType(v); setOpenFilter(null); }}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                  style={filterType === v
                    ? { backgroundColor: v === "BUY" ? "rgba(22,163,74,0.12)" : v === "SELL" ? "rgba(220,38,38,0.12)" : "rgba(59,130,246,0.12)",
                        color: v === "BUY" ? "#16a34a" : v === "SELL" ? "#dc2626" : ACCENT }
                    : { color: "var(--muted-foreground)" }}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {openFilter === "codigo" && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Ativo</p>
              <button onClick={() => { setFilterSymbol("TODOS"); setOpenFilter(null); }}
                className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={filterSymbol === "TODOS" ? { backgroundColor: "rgba(59,130,246,0.12)", color: ACCENT } : { color: "var(--muted-foreground)" }}>
                Todos
              </button>
              <div className="max-h-48 overflow-y-auto space-y-0.5 mt-1">
                {symbols.map((s) => (
                  <button key={s} onClick={() => { setFilterSymbol(s); setOpenFilter(null); }}
                    className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                    style={filterSymbol === s ? { backgroundColor: "rgba(59,130,246,0.12)", color: ACCENT } : { color: "var(--foreground)" }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {openFilter === "origem" && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Origem</p>
              <button onClick={() => { setFilterOrigem("ALL"); setOpenFilter(null); }}
                className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={filterOrigem === "ALL" ? { backgroundColor: "rgba(59,130,246,0.12)", color: ACCENT } : { color: "var(--muted-foreground)" }}>
                Todos
              </button>
              {(Object.entries(ORIGEM_LABELS) as [OrigemRecursos, string][]).map(([v, label]) => (
                <button key={v} onClick={() => { setFilterOrigem(v); setOpenFilter(null); }}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                  style={filterOrigem === v
                    ? { backgroundColor: ORIGEM_COLORS[v].bg, color: ORIGEM_COLORS[v].text }
                    : { color: "var(--foreground)" }}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <OperationDialog
        open={!!editingOp}
        onClose={() => setEditingOp(null)}
        onSaved={() => { setEditingOp(null); onRefresh(); }}
        initialOp={editingOp ?? undefined}
      />
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

const EVOL_KEYS = ["aporte", "realocacao", "provento", "valorizacao"] as const;
type EvolKey = typeof EVOL_KEYS[number];
const EVOL_COLORS: Record<EvolKey, string> = {
  aporte:      "#3b82f6",
  realocacao:  "#f97316",
  provento:    "#8b5cf6",
  valorizacao: "#10b981",
};
const EVOL_LABELS: Record<EvolKey, string> = {
  aporte:      "Aporte",
  realocacao:  "Realocação",
  provento:    "Provento",
  valorizacao: "Valorização",
};

const MONTH_ABBR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function EvolucaoTab({ operations, totals }: { operations: Operation[]; totals: Totals }) {
  const chartData = useMemo(() => {
    if (!operations.length) return [];

    const state = { APORTE: 0, REALOCACAO: 0, PROVENTO: 0 };
    let totalInv = 0;
    const byMonth: Record<string, { APORTE: number; REALOCACAO: number; PROVENTO: number }> = {};

    const sorted = [...operations].sort((a, b) => a.operation_date.localeCompare(b.operation_date));
    for (const op of sorted) {
      if (op.operation_type === "BUY") {
        const origin = (op.origem_recursos ?? "APORTE") as keyof typeof state;
        state[origin] += op.total;
        totalInv += op.total;
      } else if (totalInv > 0) {
        const ratio = Math.min(op.total / totalInv, 1);
        state.APORTE    = Math.max(0, state.APORTE    * (1 - ratio));
        state.REALOCACAO = Math.max(0, state.REALOCACAO * (1 - ratio));
        state.PROVENTO  = Math.max(0, state.PROVENTO  * (1 - ratio));
        totalInv = Math.max(0, totalInv - op.total);
      }
      const monthKey = op.operation_date.slice(0, 7);
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
          valorizacao: 0,
        };
      });

    if (points.length > 0 && totals.currentValue > 0) {
      const lastMonthKey = Object.keys(byMonth).sort().pop()!;
      const todayKey = new Date().toISOString().slice(0, 7);
      const lastS = byMonth[lastMonthKey];
      const invested = lastS.APORTE + lastS.REALOCACAO + lastS.PROVENTO;
      const val = Math.max(0, Math.round(totals.currentValue - invested));

      if (todayKey > lastMonthKey) {
        points.push({
          date: "Hoje",
          aporte:      Math.round(lastS.APORTE),
          realocacao:  Math.round(lastS.REALOCACAO),
          provento:    Math.round(lastS.PROVENTO),
          valorizacao: val,
        });
      } else {
        points[points.length - 1].valorizacao = val;
      }
    }

    return points;
  }, [operations, totals.currentValue]);

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
            contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", backgroundColor: "var(--popover)", fontSize: 12 }}
            formatter={(v: unknown, name: unknown) => [fmtBRL(v as number), EVOL_LABELS[name as EvolKey] ?? String(name)]} />
          <Bar dataKey="aporte"      name="aporte"      stackId="a" fill={EVOL_COLORS.aporte} />
          <Bar dataKey="realocacao"  name="realocacao"  stackId="a" fill={EVOL_COLORS.realocacao} />
          <Bar dataKey="provento"    name="provento"    stackId="a" fill={EVOL_COLORS.provento} />
          <Bar dataKey="valorizacao" name="valorizacao" stackId="a" fill={EVOL_COLORS.valorizacao} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-border">
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
  const [showAdd, setShowAdd] = useState(false);

  // Filter state (lifted here so summary cards can react)
  const [filterSymbol, setFilterSymbol] = useState("TODOS");
  const [filterType, setFilterType] = useState<"ALL" | "BUY" | "SELL">("ALL");
  const [filterOrigem, setFilterOrigem] = useState<"ALL" | OrigemRecursos>("ALL");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

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

  const handleDeleteOp = (id: string) => {
    setData((prev) => prev ? { ...prev, operations: prev.operations.filter((o) => o.id !== id) } : prev);
    fetchData();
  };

  // All hooks must run before any early return (Rules of Hooks)
  const { operations, positions, totals, isReadOnly, ownerName } = data ?? {
    operations: [], positions: [],
    totals: { totalInvested: 0, currentValue: 0, gain: 0, gainPercent: 0, totalDividends12m: 0, totalReturn: 0, totalReturnPercent: 0 },
    isReadOnly: false,
    ownerName: null,
  };

  const hasFilters = filterSymbol !== "TODOS" || filterType !== "ALL" || filterOrigem !== "ALL" || filterDateFrom || filterDateTo;

  const displayTotals = useMemo((): Totals => {
    if (!hasFilters) return totals;
    const priceMap: Record<string, number> = {};
    for (const p of positions) priceMap[p.symbol] = p.currentPrice;

    const bySymbol: Record<string, { cost: number; qty: number }> = {};
    for (const op of operations) {
      if (filterSymbol !== "TODOS" && op.symbol !== filterSymbol) continue;
      if (filterType !== "ALL" && op.operation_type !== filterType) continue;
      if (filterOrigem !== "ALL" && op.origem_recursos !== filterOrigem) continue;
      if (filterDateFrom && op.operation_date < filterDateFrom) continue;
      if (filterDateTo && op.operation_date > filterDateTo) continue;

      if (!bySymbol[op.symbol]) bySymbol[op.symbol] = { cost: 0, qty: 0 };
      if (op.operation_type === "BUY") {
        bySymbol[op.symbol].cost += op.total;
        bySymbol[op.symbol].qty += op.quantity;
      } else {
        const avg = bySymbol[op.symbol].qty > 0 ? bySymbol[op.symbol].cost / bySymbol[op.symbol].qty : 0;
        bySymbol[op.symbol].qty -= op.quantity;
        bySymbol[op.symbol].cost -= avg * op.quantity;
      }
    }

    let totalInvested = 0, currentValue = 0;
    for (const [sym, v] of Object.entries(bySymbol)) {
      if (v.qty > 0.0001) {
        totalInvested += v.cost;
        currentValue += v.qty * (priceMap[sym] ?? 0);
      }
    }
    const gain = currentValue - totalInvested;
    const gainPercent = totalInvested > 0 ? (gain / totalInvested) * 100 : 0;
    // Dividend totals: sum from matching positions
    const filteredSymbols = new Set(Object.keys(bySymbol).filter(s => bySymbol[s].qty > 0.0001));
    const totalDividends12m = positions
      .filter(p => filteredSymbols.has(p.symbol))
      .reduce((s, p) => s + p.dividends12m, 0);
    const totalReturn = gain + totalDividends12m;
    const totalReturnPercent = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;
    return { totalInvested, currentValue, gain, gainPercent, totalDividends12m, totalReturn, totalReturnPercent };
  }, [operations, positions, totals, hasFilters, filterSymbol, filterType, filterOrigem, filterDateFrom, filterDateTo]);

  const filteredPositionCount = useMemo(() => {
    if (!hasFilters) return positions.length;
    const bySymbol: Record<string, number> = {};
    for (const op of operations) {
      if (filterSymbol !== "TODOS" && op.symbol !== filterSymbol) continue;
      if (filterType !== "ALL" && op.operation_type !== filterType) continue;
      if (filterOrigem !== "ALL" && op.origem_recursos !== filterOrigem) continue;
      if (filterDateFrom && op.operation_date < filterDateFrom) continue;
      if (filterDateTo && op.operation_date > filterDateTo) continue;
      if (!bySymbol[op.symbol]) bySymbol[op.symbol] = 0;
      bySymbol[op.symbol] += op.operation_type === "BUY" ? op.quantity : -op.quantity;
    }
    return Object.values(bySymbol).filter((q) => q > 0.0001).length;
  }, [operations, positions.length, hasFilters, filterSymbol, filterType, filterOrigem, filterDateFrom, filterDateTo]);

  const isPos = displayTotals.gain >= 0;

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
          value={fmtBRL(displayTotals.totalInvested)}
          sub={hasFilters ? "filtrado" : `${filteredPositionCount} ativo${filteredPositionCount !== 1 ? "s" : ""}`}
          icon={<Wallet className="h-5 w-5" style={{ color: ACCENT }} />}
        />
        <SummaryCard
          label="Valor Atual"
          value={fmtBRL(displayTotals.currentValue)}
          sub={isPos ? `+${fmtPct(displayTotals.gainPercent)} valoriz.` : fmtPct(displayTotals.gainPercent)}
          positive={displayTotals.currentValue > 0 ? isPos : undefined}
          icon={isPos
            ? <TrendingUp className="h-5 w-5 text-emerald-500" />
            : <TrendingDown className="h-5 w-5 text-red-500" />}
        />
        <SummaryCard
          label="Dividendos 12m"
          value={fmtBRL(displayTotals.totalDividends12m)}
          sub={displayTotals.totalInvested > 0
            ? `DY ${((displayTotals.totalDividends12m / displayTotals.totalInvested) * 100).toFixed(2)}% s/ PM`
            : undefined}
          positive={displayTotals.totalDividends12m > 0 ? true : undefined}
          icon={<Coins className="h-5 w-5 text-emerald-500" />}
        />
        <SummaryCard
          label="Valorização"
          value={fmtBRL(displayTotals.gain)}
          sub={fmtPct(displayTotals.gainPercent)}
          positive={isPos}
          icon={<BarChart2 className="h-5 w-5" style={{ color: isPos ? "#16a34a" : "#dc2626" }} />}
        />
        <SummaryCard
          label="Retorno Total"
          value={fmtBRL(displayTotals.totalReturn)}
          sub={`${fmtPct(displayTotals.totalReturnPercent)} (val. + div.)`}
          positive={displayTotals.totalReturn >= 0}
          icon={displayTotals.totalReturn >= 0
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
      {activeTab === "Posições" && <PositionsTab positions={positions} totals={totals} />}
      {activeTab === "Operações" && (
        <OperationsTab
          operations={operations} onDelete={handleDeleteOp} onAdd={() => setShowAdd(true)} onRefresh={fetchData}
          isReadOnly={isReadOnly}
          filterSymbol={filterSymbol} filterType={filterType} filterOrigem={filterOrigem}
          filterDateFrom={filterDateFrom} filterDateTo={filterDateTo}
          setFilterSymbol={setFilterSymbol} setFilterType={setFilterType} setFilterOrigem={setFilterOrigem}
          setFilterDateFrom={setFilterDateFrom} setFilterDateTo={setFilterDateTo}
        />
      )}
      {activeTab === "Proventos" && <ProventosTab positions={positions} />}
      {activeTab === "Evolução" && <EvolucaoTab operations={operations} totals={totals} />}

      {!isReadOnly && <OperationDialog open={showAdd} onClose={() => setShowAdd(false)} onSaved={fetchData} />}
    </div>
  );
}

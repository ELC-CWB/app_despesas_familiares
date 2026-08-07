"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Plus, Trash2, ChevronDown, Loader2, AlertCircle, CalendarDays,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

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

type OperationsData = {
  operations: Operation[];
  isReadOnly: boolean;
  ownerName: string | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCENT = "#3b82f6";

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
};

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

// ── Main Component ────────────────────────────────────────────────────────────

export function OperationsClient() {
  const [data, setData] = useState<OperationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

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
      if (!res.ok) throw new Error(json.error ?? "Erro ao carregar operações");
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

  const { operations, isReadOnly, ownerName } = data ?? { operations: [], isReadOnly: false, ownerName: null };

  return (
    <div className="space-y-4">
      {isReadOnly && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium"
          style={{ borderColor: `${ACCENT}4d`, backgroundColor: `${ACCENT}0d`, color: ACCENT }}>
          <span className="text-base">👁</span>
          Você está visualizando as operações de <strong>{ownerName ?? "outro membro"}</strong> — somente leitura
        </div>
      )}

      <OperationsTab
        operations={operations} onDelete={handleDeleteOp} onAdd={() => setShowAdd(true)} onRefresh={fetchData}
        isReadOnly={isReadOnly}
        filterSymbol={filterSymbol} filterType={filterType} filterOrigem={filterOrigem}
        filterDateFrom={filterDateFrom} filterDateTo={filterDateTo}
        setFilterSymbol={setFilterSymbol} setFilterType={setFilterType} setFilterOrigem={setFilterOrigem}
        setFilterDateFrom={setFilterDateFrom} setFilterDateTo={setFilterDateTo}
      />

      {!isReadOnly && <OperationDialog open={showAdd} onClose={() => setShowAdd(false)} onSaved={fetchData} />}
    </div>
  );
}

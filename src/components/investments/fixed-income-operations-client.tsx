"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle, Plus, Pencil, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { FixedIncomeIndexador, FixedIncomeTipo, FixedIncomePosition } from "@/lib/investments/fixed-income-summary";
import { TIPO_LABELS, INDEXADOR_LABELS, formatTaxaLabel } from "@/lib/investments/fixed-income-labels";

// ─── Types ───────────────────────────────────────────────────────────────────

interface HoldingsResponse {
  holdings: unknown[];
  positions: FixedIncomePosition[];
  totals: { totalPrincipal: number; totalAccruedInterest: number; totalCurrentValue: number };
  isReadOnly: boolean;
  ownerName: string | null;
}

const TIPO_ORDER: FixedIncomeTipo[] = [
  "CDB", "LCI", "LCA", "TESOURO_SELIC", "TESOURO_IPCA", "TESOURO_PREFIXADO",
  "DEBENTURE", "CRI", "CRA", "OUTRO",
];
const INDEXADOR_ORDER: FixedIncomeIndexador[] = ["CDI", "SELIC", "IPCA", "PREFIXADO"];

// ─── Formatters ──────────────────────────────────────────────────────────────

const ACCENT = "#3b82f6";

function fmtBRL(v: number | null) {
  if (v == null) return "–";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(v);
}

function fmtPct(v: number | null) {
  if (v == null) return "–";
  return `${v.toFixed(2).replace(".", ",")}%`;
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function daysUntil(iso: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(iso + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

// ─── Holding Dialog (add + edit) ────────────────────────────────────────────

type HoldingFormState = {
  tipo: FixedIncomeTipo;
  institution: string;
  indexador: FixedIncomeIndexador;
  taxa: string;
  principal: string;
  application_date: string;
  maturity_date: string;
  notes: string;
};

const BLANK_FORM: HoldingFormState = {
  tipo: "CDB",
  institution: "",
  indexador: "CDI",
  taxa: "",
  principal: "",
  application_date: new Date().toISOString().slice(0, 10),
  maturity_date: "",
  notes: "",
};

function HoldingDialog({
  open, onClose, onSaved, initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: FixedIncomePosition;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState<HoldingFormState>(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open) {
      if (initial) {
        setForm({
          tipo: initial.tipo,
          institution: initial.institution ?? "",
          indexador: initial.indexador,
          taxa: String(initial.taxa),
          principal: String(initial.principal),
          application_date: initial.application_date,
          maturity_date: initial.maturity_date,
          notes: initial.notes ?? "",
        });
      } else {
        setForm(BLANK_FORM);
      }
      setErr("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  const set = <K extends keyof HoldingFormState>(k: K, v: HoldingFormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setErr("");
    const taxa = parseFloat(form.taxa.replace(",", "."));
    const principal = parseFloat(form.principal.replace(",", "."));
    if (isNaN(taxa) || taxa < 0) return setErr("Informe uma taxa válida.");
    if (isNaN(principal) || principal <= 0) return setErr("Informe um valor aplicado válido.");
    if (!form.application_date || !form.maturity_date) return setErr("Preencha as datas de aplicação e vencimento.");
    if (form.maturity_date < form.application_date) return setErr("O vencimento não pode ser antes da aplicação.");

    setSaving(true);
    try {
      const url = isEdit ? `/api/investments/fixed-income/holdings?id=${initial!.id}` : "/api/investments/fixed-income/holdings";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: form.tipo,
          institution: form.institution.trim() || null,
          indexador: form.indexador,
          taxa,
          principal,
          application_date: form.application_date,
          maturity_date: form.maturity_date,
          notes: form.notes || null,
        }),
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
          <DialogTitle className="text-base font-bold">{isEdit ? "Editar Investimento" : "Novo Investimento"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Tipo *</label>
              <select className={inputCls} value={form.tipo} onChange={(e) => set("tipo", e.target.value as FixedIncomeTipo)}>
                {TIPO_ORDER.map((t) => <option key={t} value={t}>{TIPO_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Instituição</label>
              <input className={inputCls} placeholder="ex: Banco Inter" value={form.institution}
                onChange={(e) => set("institution", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Indexador *</label>
              <select className={inputCls} value={form.indexador} onChange={(e) => set("indexador", e.target.value as FixedIncomeIndexador)}>
                {INDEXADOR_ORDER.map((i) => <option key={i} value={i}>{INDEXADOR_LABELS[i]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Taxa * ({INDEXADOR_LABELS[form.indexador]})</label>
              <input className={inputCls} placeholder="ex: 110" value={form.taxa}
                onChange={(e) => set("taxa", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Valor Aplicado (R$) *</label>
              <input className={inputCls} placeholder="ex: 10000" value={form.principal}
                onChange={(e) => set("principal", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Data da Aplicação *</label>
              <input type="date" className={inputCls} value={form.application_date}
                onChange={(e) => set("application_date", e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Data de Vencimento *</label>
              <input type="date" className={inputCls} value={form.maturity_date}
                onChange={(e) => set("maturity_date", e.target.value)} />
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

// ─── Main Component ──────────────────────────────────────────────────────────

export function FixedIncomeOperationsClient() {
  const [data, setData] = useState<HoldingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<FixedIncomePosition | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchHoldings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/investments/fixed-income/holdings");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao carregar investimentos");
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHoldings(); }, [fetchHoldings]);

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este investimento?")) return;
    setDeleting(id);
    await fetch(`/api/investments/fixed-income/holdings?id=${id}`, { method: "DELETE" });
    await fetchHoldings();
    setDeleting(null);
  };

  const positions = data?.positions ?? [];
  const isReadOnly = data?.isReadOnly ?? false;

  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-sm">
      {isReadOnly && data?.ownerName && (
        <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg border text-xs font-medium"
          style={{ borderColor: `${ACCENT}4d`, backgroundColor: `${ACCENT}0d`, color: ACCENT }}>
          <span className="text-sm">👁</span>
          Você está visualizando os investimentos de <strong>{data.ownerName}</strong> — somente leitura
        </div>
      )}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <span className="w-1 h-3 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: ACCENT }} />
          Meus Investimentos em Renda Fixa
        </h3>
        {!isReadOnly && (
          <button onClick={() => { setEditing(null); setShowDialog(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors"
            style={{ backgroundColor: ACCENT }}>
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 gap-2">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: ACCENT }} />
          <span className="text-sm text-muted-foreground">Carregando investimentos...</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button size="sm" variant="outline" onClick={fetchHoldings}>Tentar novamente</Button>
        </div>
      ) : positions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
          <Wallet className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            Nenhum investimento registrado. Adicione seus CDBs, LCIs, LCAs e títulos do Tesouro Direto.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <KPI label="Total Aplicado" value={fmtBRL(data!.totals.totalPrincipal)} />
            <KPI label="Juros Acumulados" value={fmtBRL(data!.totals.totalAccruedInterest)} />
            <KPI label="Valor Atual" value={fmtBRL(data!.totals.totalCurrentValue)} />
          </div>
          <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
            {positions.map((p) => {
              const days = daysUntil(p.maturity_date);
              return (
                <div key={p.id} className="px-3 py-2.5 hover:bg-secondary/30 transition-colors">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <span className="text-sm font-bold text-foreground">{TIPO_LABELS[p.tipo]}</span>
                      {p.institution && <span className="text-xs text-muted-foreground ml-2 truncate">{p.institution}</span>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-sm font-bold text-foreground">{fmtBRL(p.currentValue)}</span>
                      {!isReadOnly && (
                        <>
                          <button onClick={() => { setEditing(p); setShowDialog(true); }}
                            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDelete(p.id)} disabled={deleting === p.id}
                            className="p-1 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
                            {deleting === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
        </>
      )}

      <HoldingDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        onSaved={fetchHoldings}
        initial={editing ?? undefined}
      />
    </div>
  );
}

// ─── KPI card ────────────────────────────────────────────────────────────────

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-secondary/30 rounded-lg p-2 flex flex-col gap-0.5 group relative">
      <p className="text-[10px] text-muted-foreground font-medium leading-tight truncate">{label}</p>
      <p className="text-sm font-bold leading-tight text-foreground">{value}</p>
    </div>
  );
}

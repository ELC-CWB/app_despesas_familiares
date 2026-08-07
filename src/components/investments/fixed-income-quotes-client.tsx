"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BcbIndicators {
  selic: number | null;
  cdi: number | null;
  ipca12m: number | null;
  ipcaMes: number | null;
  igpm: number | null;
  poupanca: number | null;
  referenceDate: string | null;
}

type TesouroCategoria = "Pré-fixado" | "Pós-fixado" | "Misto";

interface TesouroTitulo {
  tipoTitulo: string;
  categoria: TesouroCategoria;
  vencimento: string;
  taxa: number;
  pu: number;
  valorMinimo: number;
}

interface TesouroData {
  titulos: TesouroTitulo[];
  dataBase: string | null;
}

interface FixedIncomeResponse {
  indicators: BcbIndicators;
  tesouro: TesouroData;
}

// ─── Formatters ──────────────────────────────────────────────────────────────

const ACCENT = "#3b82f6";

const CATEGORIA_COLOR: Record<TesouroCategoria, string> = {
  "Pré-fixado": "#2563eb",
  "Pós-fixado": "#16a34a",
  "Misto": "#d97706",
};

const CATEGORIA_ORDEM: TesouroCategoria[] = ["Pré-fixado", "Pós-fixado", "Misto"];

function fmtPct(v: number | null) {
  if (v == null) return "–";
  return `${v.toFixed(2).replace(".", ",")}%`;
}

function fmtBRL(v: number | null) {
  if (v == null) return "–";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(v);
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function titleLabel(t: TesouroTitulo) {
  const ano = t.vencimento.slice(0, 4);
  const base = t.tipoTitulo.replace(" com Juros Semestrais", "");
  return { nome: `${base} ${ano}`, comJurosSemestrais: t.tipoTitulo.includes("Juros Semestrais") };
}

// ─── KPI card ────────────────────────────────────────────────────────────────

function KPI({ label, value, description }: { label: string; value: string; description?: string }) {
  return (
    <div className="bg-secondary/30 rounded-lg p-2 flex flex-col gap-0.5 group relative">
      <div className="flex items-center gap-1">
        <p className="text-[10px] text-muted-foreground font-medium leading-tight truncate">{label}</p>
        {description && (
          <div className="relative flex-shrink-0">
            <Info className="h-2.5 w-2.5 text-muted-foreground/40 cursor-help" />
            <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block bg-popover border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-muted-foreground w-52 z-10 shadow-lg leading-relaxed">
              {description}
            </div>
          </div>
        )}
      </div>
      <p className="text-sm font-bold leading-tight text-foreground">{value}</p>
    </div>
  );
}

function Section({ title, source, children }: { title: string; source?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-sm">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <span className="w-1 h-3 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: ACCENT }} />
        {title}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
        {children}
      </div>
      {source && <p className="text-[10px] text-muted-foreground/40 text-right mt-2 select-none">Fonte: {source}</p>}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function FixedIncomeQuotesClient() {
  const [data, setData] = useState<FixedIncomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategoria, setActiveCategoria] = useState<TesouroCategoria>("Pré-fixado");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/investments/fixed-income");
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Erro ao carregar dados");
        return;
      }
      setData(json);
    } catch {
      setError("Erro de rede");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: ACCENT }} />
        <span className="text-sm text-muted-foreground">Carregando dados de renda fixa...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button size="sm" variant="outline" onClick={fetchData}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const { indicators, tesouro } = data;

  const byCategoria: Partial<Record<TesouroCategoria, TesouroTitulo[]>> = {};
  for (const t of tesouro.titulos) {
    (byCategoria[t.categoria] ??= []).push(t);
  }

  const categoriasDisponiveis = CATEGORIA_ORDEM.filter(cat => byCategoria[cat]?.length);
  const categoriaSelecionada = categoriasDisponiveis.includes(activeCategoria)
    ? activeCategoria
    : categoriasDisponiveis[0];
  const titulosSelecionados = categoriaSelecionada ? byCategoria[categoriaSelecionada] ?? [] : [];

  return (
    <div className="space-y-3">
      <Section
        title="Indicadores Econômicos"
        source={`Banco Central${indicators.referenceDate ? " · " + indicators.referenceDate : ""}`}
      >
        <KPI label="Selic" value={fmtPct(indicators.selic)} description="Taxa básica de juros da economia (meta definida pelo Copom), % ao ano." />
        <KPI label="CDI" value={fmtPct(indicators.cdi)} description="Certificado de Depósito Interbancário, referência para a maioria dos investimentos pós-fixados, % ao ano." />
        <KPI label="IPCA 12m" value={fmtPct(indicators.ipca12m)} description="Inflação oficial acumulada nos últimos 12 meses." />
        <KPI label="IPCA mês" value={fmtPct(indicators.ipcaMes)} description="Variação do IPCA no último mês fechado." />
        <KPI label="IGP-M" value={fmtPct(indicators.igpm)} description="Índice Geral de Preços do Mercado, variação mensal. Usado em reajuste de aluguel e alguns contratos." />
        <KPI label="Poupança" value={fmtPct(indicators.poupanca)} description="Rendimento da caderneta de poupança no último período de referência." />
      </Section>

      <div className="bg-card border border-border rounded-xl p-3 shadow-sm">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <span className="w-1 h-3 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: ACCENT }} />
          Tesouro Direto
        </h3>

        {tesouro.titulos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
            <AlertCircle className="h-6 w-6 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Dados do Tesouro Direto indisponíveis no momento.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex gap-1 bg-secondary/50 rounded-xl p-1 w-fit">
              {categoriasDisponiveis.map((categoria) => (
                <button
                  key={categoria}
                  onClick={() => setActiveCategoria(categoria)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                  style={categoriaSelecionada === categoria
                    ? { backgroundColor: CATEGORIA_COLOR[categoria], color: "#fff" }
                    : { color: "var(--muted-foreground)" }}
                >
                  {categoria}
                </button>
              ))}
            </div>

            <div className="rounded-lg overflow-hidden border border-border overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-secondary/50">
                    <th className="text-left px-2.5 py-1.5 text-muted-foreground font-medium">Título</th>
                    <th className="text-left px-2.5 py-1.5 text-muted-foreground font-medium">Vencimento</th>
                    <th className="text-right px-2.5 py-1.5 text-muted-foreground font-medium">Taxa</th>
                    <th className="text-right px-2.5 py-1.5 text-muted-foreground font-medium">PU</th>
                    <th className="text-right px-2.5 py-1.5 text-muted-foreground font-medium">Valor mínimo</th>
                  </tr>
                </thead>
                <tbody>
                  {titulosSelecionados.map((t) => {
                    const { nome, comJurosSemestrais } = titleLabel(t);
                    return (
                      <tr key={`${t.tipoTitulo}|${t.vencimento}`} className="border-t border-border hover:bg-secondary/20 transition-colors">
                        <td className="px-2.5 py-1.5">
                          <span className="font-medium text-foreground">{nome}</span>
                          {comJurosSemestrais && (
                            <span className="ml-1.5 px-1 py-0.5 rounded text-[9px] font-semibold bg-secondary text-muted-foreground">
                              juros semestrais
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-1.5 text-muted-foreground">{fmtDate(t.vencimento)}</td>
                        <td className="px-2.5 py-1.5 text-right font-semibold text-foreground">{fmtPct(t.taxa)}</td>
                        <td className="px-2.5 py-1.5 text-right text-muted-foreground">{fmtBRL(t.pu)}</td>
                        <td className="px-2.5 py-1.5 text-right text-muted-foreground">{fmtBRL(t.valorMinimo)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground/40 text-right select-none">
              Fonte: Tesouro Transparente{tesouro.dataBase ? ` · ${fmtDate(tesouro.dataBase)}` : ""}
            </p>
          </div>
        )}
      </div>

      {tesouro.titulos.length > 0 && (
        <div className="bg-secondary/20 border border-border rounded-xl p-3 text-[11px] text-muted-foreground leading-relaxed">
          <p className="font-semibold text-foreground mb-1">Tributação (igual para todos os títulos)</p>
          <p>IR regressivo sobre o rendimento: 22,5% até 180 dias · 20% de 181 a 360 dias · 17,5% de 361 a 720 dias · 15% acima de 720 dias.</p>
          <p>IOF regressivo apenas em resgates com até 30 dias da aplicação: de 96% no 1º dia até 0% no 30º dia.</p>
        </div>
      )}
    </div>
  );
}

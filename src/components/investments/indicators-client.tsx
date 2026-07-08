"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, AlertCircle, TrendingUp, TrendingDown, Info, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BolsaiData {
  cvm_code?: string;
  ticker: string;
  corporate_name?: string;
  reference_date?: string;
  close_price?: number;
  shares_outstanding?: number;
  market_cap?: number;
  // Valuation
  pl?: number;
  pvp?: number;
  ev_ebitda?: number;
  ev_ebit?: number;
  p_ebitda?: number;
  p_ebit?: number;
  p_sr?: number;
  p_assets?: number;
  lpa?: number;
  vpa?: number;
  // Rentabilidade (já em %)
  gross_margin?: number;
  net_margin?: number;
  ebitda_margin?: number;
  ebit_margin?: number;
  roe?: number;
  roa?: number;
  roic?: number;
  ebit_over_assets?: number;
  asset_turnover?: number;
  // Crescimento (já em %)
  cagr_revenue_5y?: number;
  cagr_earnings_5y?: number;
  // Endividamento
  current_ratio?: number;
  debt_equity?: number;
  net_debt_equity?: number;
  net_debt_ebitda?: number;
  net_debt_ebit?: number;
  // Financeiros (R$ mil → multiplicar por 1000)
  net_income?: number;
  equity?: number;
  net_revenue?: number;
  total_debt?: number;
  ebitda?: number;
  ebit?: number;
  net_debt?: number;
  cash?: number;
  total_assets?: number;
  current_assets?: number;
  current_liabilities?: number;
}

interface CashDividend {
  paymentDate: string;
  rate: number;
  label: string;
  lastDatePrior: string;
}

interface IndicatorsClientProps {
  symbols: string[];
}

// ─── Formatters ──────────────────────────────────────────────────────────────

const ACCENT = "#3b82f6";

function n(v: number | undefined) { return v ?? null; }

function fmtBRL(v: number | null) {
  if (v == null) return "–";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(v);
}

function fmtPct(v: number | null) {
  if (v == null) return "–";
  return `${v.toFixed(2).replace(".", ",")}%`;
}

function fmtMul(v: number | null, dec = 2) {
  if (v == null) return "–";
  return `${v.toFixed(dec).replace(".", ",")}x`;
}

function fmtNum(v: number | null, dec = 2) {
  if (v == null) return "–";
  return v.toFixed(dec).replace(".", ",");
}

// Financial values from bolsai are in R$ mil (thousands)
function fmtFin(v: number | null | undefined) {
  if (v == null) return "–";
  const actual = v * 1000;
  if (Math.abs(actual) >= 1e12) return `R$ ${(actual / 1e12).toFixed(2).replace(".", ",")}T`;
  if (Math.abs(actual) >= 1e9)  return `R$ ${(actual / 1e9).toFixed(2).replace(".", ",")}B`;
  if (Math.abs(actual) >= 1e6)  return `R$ ${(actual / 1e6).toFixed(2).replace(".", ",")}M`;
  return fmtBRL(actual);
}

function fmtLarge(v: number | null | undefined) {
  if (v == null) return "–";
  if (Math.abs(v) >= 1e12) return `R$ ${(v / 1e12).toFixed(2).replace(".", ",")}T`;
  if (Math.abs(v) >= 1e9)  return `R$ ${(v / 1e9).toFixed(2).replace(".", ",")}B`;
  if (Math.abs(v) >= 1e6)  return `R$ ${(v / 1e6).toFixed(2).replace(".", ",")}M`;
  return fmtBRL(v);
}

// ─── KPI card ────────────────────────────────────────────────────────────────

function KPI({
  label, value, sub, description, positive,
}: {
  label: string;
  value: string;
  sub?: string;
  description?: string;
  positive?: boolean | null;
}) {
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
      <p
        className="text-sm font-bold leading-tight"
        style={{
          color: positive === true ? "#22c55e"
               : positive === false ? "#ef4444"
               : "var(--foreground)",
        }}
      >
        {value}
      </p>
      {sub && <p className="text-[10px] text-muted-foreground leading-tight">{sub}</p>}
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
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
        {children}
      </div>
      {source && <p className="text-[10px] text-muted-foreground/40 text-right mt-2 select-none">Fonte: {source}</p>}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function IndicatorsClient({ symbols }: IndicatorsClientProps) {
  const searchParams = useSearchParams();
  const urlSymbol = searchParams.get("symbol")?.toUpperCase() ?? null;

  // Merge URL symbol with watchlist (URL symbol may not be in watchlist)
  const allSymbols = useMemo(() => {
    if (urlSymbol && !symbols.includes(urlSymbol)) return [urlSymbol, ...symbols];
    return symbols;
  }, [symbols, urlSymbol]);

  const [selectedSymbol, setSelectedSymbol] = useState<string>(urlSymbol ?? symbols[0] ?? "PETR4");
  const [filterQuery, setFilterQuery] = useState("");
  const [data, setData] = useState<{
    bolsai: BolsaiData;
    price: number | null;
    change: number | null;
    changePct: number | null;
    logourl: string | null;
    shortName: string | null;
    cashDividends: CashDividend[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const fetchIndicators = useCallback(async (symbol: string) => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/investments/indicators?symbol=${symbol}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Erro ao carregar indicadores");
        setData(null);
        return;
      }
      setData(json);
      setFetchedAt(new Date());
    } catch {
      setError("Erro de rede");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSymbol) fetchIndicators(selectedSymbol);
  }, [selectedSymbol, fetchIndicators]);

  const b = data?.bolsai;
  const isUp = (data?.change ?? 0) >= 0;
  const refDate = b?.reference_date
    ? new Date(b.reference_date + "T00:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
    : null;

  return (
    <div className="space-y-3">
      {/* Stock selector */}
      <div className="bg-card border border-border rounded-xl p-3 shadow-sm space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none" style={{ color: ACCENT }} />
          <input
            type="text"
            placeholder="Buscar ativo por código (ex: PETR4)..."
            value={filterQuery}
            onChange={e => setFilterQuery(e.target.value.toUpperCase())}
            onKeyDown={e => {
              if (e.key === "Enter" && filterQuery.trim()) {
                setSelectedSymbol(filterQuery.trim());
                setFilterQuery("");
              }
            }}
            className="w-full pl-8 pr-4 py-2 text-sm font-medium rounded-lg border-2 bg-background focus:outline-none transition-colors placeholder:text-muted-foreground/50"
            style={{
              borderColor: filterQuery ? ACCENT : "var(--border)",
            } as React.CSSProperties}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allSymbols
            .filter(s => !filterQuery || s.includes(filterQuery))
            .map((s) => (
              <button
                key={s}
                onClick={() => { setSelectedSymbol(s); setFilterQuery(""); }}
                className="px-2.5 py-1 rounded-md text-xs font-semibold transition-all"
                style={
                  selectedSymbol === s
                    ? { backgroundColor: ACCENT, color: "#fff" }
                    : { color: "var(--muted-foreground)", border: "1px solid var(--border)" }
                }
              >
                {s}
              </button>
            ))}
          {/* Option to search arbitrary ticker not in watchlist */}
          {filterQuery.length >= 4 && !allSymbols.includes(filterQuery) && (
            <button
              onClick={() => { setSelectedSymbol(filterQuery); setFilterQuery(""); }}
              className="px-2.5 py-1 rounded-md text-xs font-semibold transition-all border"
              style={{ borderColor: ACCENT, color: ACCENT, borderStyle: "dashed" }}
            >
              Buscar {filterQuery}
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 gap-2">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: ACCENT }} />
          <span className="text-sm text-muted-foreground">Carregando indicadores...</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button size="sm" variant="outline" onClick={() => fetchIndicators(selectedSymbol)}>
            Tentar novamente
          </Button>
        </div>
      )}

      {/* Content */}
      {!loading && !error && b && (
        <>
          {/* Header */}
          <div className="bg-card border border-border rounded-xl p-3 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {data?.logourl ? (
                <img src={data.logourl} alt={b.ticker} className="h-9 w-9 rounded-lg object-contain bg-secondary flex-shrink-0" />
              ) : (
                <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ backgroundColor: ACCENT }}>
                  {b.ticker.slice(0, 2)}
                </div>
              )}
              <div>
                <p className="font-bold text-foreground text-base leading-tight">{b.ticker}</p>
                <p className="text-xs text-muted-foreground leading-tight">{data?.shortName ?? b.corporate_name}</p>
                {refDate && <p className="text-[10px] text-muted-foreground/50 leading-tight">Dados: {refDate}</p>}
              </div>
            </div>
            <div className="flex items-center gap-4">
              {data?.price != null && (
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">Cotação atual</p>
                  <p className="text-xl font-bold text-foreground leading-tight">{fmtBRL(data.price)}</p>
                  <div className="flex items-center gap-1 justify-end">
                    {isUp
                      ? <TrendingUp className="h-3 w-3 text-green-500" />
                      : <TrendingDown className="h-3 w-3 text-red-500" />}
                    <span className="text-xs font-semibold" style={{ color: isUp ? "#22c55e" : "#ef4444" }}>
                      {fmtBRL(data.change)} ({fmtPct(data.changePct)})
                    </span>
                  </div>
                </div>
              )}
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">Cap. Mercado</p>
                <p className="text-sm font-bold text-foreground">{fmtLarge(b.market_cap)}</p>
              </div>
            </div>
            <p className="w-full text-[10px] text-muted-foreground/40 text-right -mt-1 select-none">
              Cotação: Yahoo Finance · Indicadores: Fundamentus{fetchedAt ? ` · ${fetchedAt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}
            </p>
          </div>

          {/* Valuation */}
          <Section title="Valuation" source="Fundamentus">
            <KPI label="P/L" value={fmtNum(n(b.pl))} description="Preço / Lucro por ação. Quantos anos para recuperar o investimento pelo lucro." />
            <KPI label="P/VP" value={fmtNum(n(b.pvp))} description="Preço / Valor Patrimonial por ação. Abaixo de 1 pode indicar desconto em relação ao patrimônio." />
            <KPI label="P/EBITDA" value={fmtNum(n(b.p_ebitda))} description="Preço / EBITDA por ação." />
            <KPI label="P/EBIT" value={fmtNum(n(b.p_ebit))} description="Preço / EBIT por ação." />
            <KPI label="EV/EBITDA" value={fmtMul(n(b.ev_ebitda))} description="Enterprise Value / EBITDA. Muito usado para comparar empresas com diferentes estruturas de capital." />
            <KPI label="EV/EBIT" value={fmtMul(n(b.ev_ebit))} description="Enterprise Value / EBIT." />
            <KPI label="P/SR" value={fmtNum(n(b.p_sr))} description="Preço / Receita Líquida por ação." />
            <KPI label="P/Ativos" value={fmtNum(n(b.p_assets))} description="Preço de mercado / Total de ativos." />
          </Section>

          {/* Rentabilidade */}
          <Section title="Rentabilidade" source="Fundamentus">
            <KPI label="ROE" value={fmtPct(n(b.roe))} description="Retorno sobre o Patrimônio Líquido. Mede a eficiência do uso do capital próprio." positive={b.roe != null ? b.roe > 10 : null} />
            <KPI label="ROA" value={fmtPct(n(b.roa))} description="Retorno sobre os Ativos Totais." positive={b.roa != null ? b.roa > 5 : null} />
            <KPI label="ROIC" value={fmtPct(n(b.roic))} description="Retorno sobre o Capital Investido. Inclui dívida + patrimônio no denominador." positive={b.roic != null ? b.roic > 10 : null} />
            <KPI label="EBIT/Ativos" value={fmtPct(n(b.ebit_over_assets))} description="EBIT / Ativos Totais. Rentabilidade operacional sobre todos os ativos." positive={b.ebit_over_assets != null ? b.ebit_over_assets > 5 : null} />
            <KPI label="Margem Bruta" value={fmtPct(n(b.gross_margin))} description="(Receita - CMV) / Receita. Eficiência operacional antes das despesas." positive={b.gross_margin != null ? b.gross_margin > 20 : null} />
            <KPI label="Margem EBITDA" value={fmtPct(n(b.ebitda_margin))} description="EBITDA / Receita Líquida." positive={b.ebitda_margin != null ? b.ebitda_margin > 15 : null} />
            <KPI label="Margem EBIT" value={fmtPct(n(b.ebit_margin))} description="EBIT / Receita Líquida." positive={b.ebit_margin != null ? b.ebit_margin > 10 : null} />
            <KPI label="Margem Líquida" value={fmtPct(n(b.net_margin))} description="Lucro Líquido / Receita Líquida." positive={b.net_margin != null ? b.net_margin > 0 : null} />
          </Section>

          {/* Crescimento + Por Ação */}
          <Section title="Crescimento (CAGR 5a) e Por Ação" source="Fundamentus">
            <KPI label="CAGR Receita" value={fmtPct(n(b.cagr_revenue_5y))} description="Taxa de crescimento anual composta da receita líquida nos últimos 5 anos." positive={b.cagr_revenue_5y != null ? b.cagr_revenue_5y > 0 : null} />
            <KPI label="CAGR Lucro" value={fmtPct(n(b.cagr_earnings_5y))} description="Taxa de crescimento anual composta do lucro líquido nos últimos 5 anos." positive={b.cagr_earnings_5y != null ? b.cagr_earnings_5y > 0 : null} />
            <KPI label="Giro do Ativo" value={fmtNum(n(b.asset_turnover))} description="Receita / Ativos Totais. Mede a eficiência com que a empresa usa seus ativos para gerar receita." />
            <KPI label="LPA" value={fmtBRL(n(b.lpa))} description="Lucro por ação (EPS). Lucro Líquido / Número de ações." positive={b.lpa != null ? b.lpa > 0 : null} />
            <KPI label="VPA" value={fmtBRL(n(b.vpa))} description="Valor Patrimonial por ação = Patrimônio Líquido / Número de ações." />
          </Section>

          {/* Endividamento */}
          <Section title="Liquidez e Endividamento" source="Fundamentus">
            <KPI label="Liq. Corrente" value={fmtNum(n(b.current_ratio))} description="Ativo Circulante / Passivo Circulante. Acima de 1 indica capacidade de pagar obrigações de curto prazo." positive={b.current_ratio != null ? b.current_ratio > 1 : null} />
            <KPI label="DL/EBITDA" value={fmtMul(n(b.net_debt_ebitda))} description="Dívida Líquida / EBITDA. Indica quantos anos de geração de caixa operacional para quitar a dívida líquida." positive={b.net_debt_ebitda != null ? b.net_debt_ebitda < 2 : null} />
            <KPI label="DL/EBIT" value={fmtMul(n(b.net_debt_ebit))} description="Dívida Líquida / EBIT." positive={b.net_debt_ebit != null ? b.net_debt_ebit < 3 : null} />
            <KPI label="DL/PL" value={fmtMul(n(b.net_debt_equity))} description="Dívida Líquida / Patrimônio Líquido." positive={b.net_debt_equity != null ? b.net_debt_equity < 1 : null} />
            <KPI label="D/PL" value={fmtMul(n(b.debt_equity))} description="Dívida Total / Patrimônio Líquido." positive={b.debt_equity != null ? b.debt_equity < 1.5 : null} />
          </Section>

          {/* Dividendos */}
          {(() => {
            const divs = data?.cashDividends ?? [];
            const now = new Date();
            const oneYearAgo = new Date(now); oneYearAgo.setFullYear(now.getFullYear() - 1);

            // Paid in last 12 months
            const paid12m = divs.filter(d => {
              const dt = new Date(d.paymentDate);
              return dt <= now && dt >= oneYearAgo;
            });
            const dpa12m = paid12m.reduce((s, d) => s + d.rate, 0);
            const dy12m = data?.price && data.price > 0 ? (dpa12m / data.price) * 100 : null;
            const payout = b.lpa && b.lpa > 0 ? (dpa12m / b.lpa) * 100 : null;

            // Next upcoming payment
            const upcoming = divs
              .filter(d => new Date(d.paymentDate) > now)
              .sort((a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime())[0];

            // Recent history (last 8)
            const history = [...divs]
              .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())
              .slice(0, 8);

            if (divs.length === 0) return null;

            return (
              <div className="bg-card border border-border rounded-xl p-3 shadow-sm space-y-2.5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <span className="w-1 h-3 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: ACCENT }} />
                  Dividendos
                </h3>

                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  <KPI
                    label="DY 12m"
                    value={dy12m != null ? fmtPct(dy12m) : "–"}
                    description="Dividend Yield: soma dos dividendos pagos nos últimos 12 meses dividida pelo preço atual."
                    positive={dy12m != null ? dy12m > 4 : null}
                  />
                  <KPI
                    label="DPA 12m"
                    value={dpa12m > 0 ? fmtBRL(dpa12m) : "–"}
                    description="Dividendo por ação pago nos últimos 12 meses."
                    positive={dpa12m > 0 ? true : null}
                  />
                  <KPI
                    label="Payout"
                    value={payout != null ? fmtPct(payout) : "–"}
                    description="Percentual do lucro por ação distribuído como dividendo."
                  />
                  <KPI
                    label="Próx. pagamento"
                    value={upcoming
                      ? new Date(upcoming.paymentDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" })
                      : "–"}
                    sub={upcoming ? `${fmtBRL(upcoming.rate)} / ação · ${upcoming.label}` : undefined}
                    description={upcoming
                      ? `Pagamento em ${new Date(upcoming.paymentDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}. Data ex: ${upcoming.lastDatePrior ? new Date(upcoming.lastDatePrior).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" }) : "–"}`
                      : "Nenhum pagamento futuro anunciado."}
                    positive={upcoming ? true : null}
                  />
                </div>

                {/* History table */}
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium mb-1.5 uppercase tracking-wide">Histórico recente</p>
                  <div className="rounded-lg overflow-hidden border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-secondary/50">
                          <th className="text-left px-2.5 py-1.5 text-muted-foreground font-medium">Tipo</th>
                          <th className="text-left px-2.5 py-1.5 text-muted-foreground font-medium">Data ex</th>
                          <th className="text-left px-2.5 py-1.5 text-muted-foreground font-medium">Pagamento</th>
                          <th className="text-right px-2.5 py-1.5 text-muted-foreground font-medium">R$/ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((d, i) => {
                          const isPaid = new Date(d.paymentDate) <= now;
                          return (
                            <tr key={i} className="border-t border-border hover:bg-secondary/20 transition-colors">
                              <td className="px-2.5 py-1.5">
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9px] font-semibold"
                                  style={{
                                    backgroundColor: d.label === "DIVIDENDO" ? "rgba(34,197,94,0.12)"
                                      : d.label === "JCP" ? "rgba(59,130,246,0.12)"
                                      : "rgba(168,85,247,0.12)",
                                    color: d.label === "DIVIDENDO" ? "#16a34a"
                                      : d.label === "JCP" ? "#2563eb"
                                      : "#7c3aed",
                                  }}
                                >
                                  {d.label}
                                </span>
                              </td>
                              <td className="px-2.5 py-1.5 text-muted-foreground">
                                {d.lastDatePrior
                                  ? new Date(d.lastDatePrior).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" })
                                  : "–"}
                              </td>
                              <td className="px-2.5 py-1.5">
                                <span className={isPaid ? "text-muted-foreground" : "font-medium"} style={{ color: isPaid ? undefined : ACCENT }}>
                                  {new Date(d.paymentDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" })}
                                  {!isPaid && <span className="ml-1 text-[10px]">●</span>}
                                </span>
                              </td>
                              <td className="px-2.5 py-1.5 text-right font-semibold text-foreground">
                                {fmtBRL(d.rate)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground/40 text-right mt-2 select-none">Fonte: Fundamentus</p>
              </div>
            );
          })()}

          {/* Financeiro */}
          <Section title="Dados Financeiros" source="Fundamentus">
            <KPI label="Receita Líq." value={fmtFin(b.net_revenue)} description="Receita líquida total (últimos 12 meses)." />
            <KPI label="EBITDA" value={fmtFin(b.ebitda)} description="Lucro antes de juros, impostos, depreciação e amortização." positive={b.ebitda != null ? b.ebitda > 0 : null} />
            <KPI label="EBIT" value={fmtFin(b.ebit)} description="Lucro antes de juros e impostos (resultado operacional)." positive={b.ebit != null ? b.ebit > 0 : null} />
            <KPI label="Lucro Líq." value={fmtFin(b.net_income)} description="Lucro líquido do período (últimos 12 meses)." positive={b.net_income != null ? b.net_income > 0 : null} />
            <KPI label="Dívida Total" value={fmtFin(b.total_debt)} description="Dívida bruta total (curto + longo prazo)." />
            <KPI label="Dívida Líq." value={fmtFin(b.net_debt)} description="Dívida Total – Caixa e equivalentes." />
            <KPI label="Caixa" value={fmtFin(b.cash)} description="Caixa e equivalentes de caixa." positive={b.cash != null ? b.cash > 0 : null} />
            <KPI label="PL" value={fmtFin(b.equity)} description="Patrimônio Líquido total." positive={b.equity != null ? b.equity > 0 : null} />
            <KPI label="Ativos Totais" value={fmtFin(b.total_assets)} description="Total de ativos da empresa." />
          </Section>
        </>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle, Activity, TrendingUp, TrendingDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Fundamentals {
  symbol: string;
  shortName: string;
  logourl: string | null;
  currency: string;
  regularMarketPrice: number | null;
  regularMarketChange: number | null;
  regularMarketChangePercent: number | null;
  marketCap: number | null;
  enterpriseValue: number | null;
  // Valuation
  priceEarnings: number | null;
  priceToBook: number | null;
  priceToSalesTrailing12Months: number | null;
  dividendYield: number | null;
  dividendsPerShare: number | null;
  beta: number | null;
  pegRatio: number | null;
  forwardPE: number | null;
  // Rentabilidade
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  profitMargins: number | null;
  operatingMargins: number | null;
  grossMargins: number | null;
  ebitdaMargins: number | null;
  // Crescimento
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  // Por Ação
  earningsPerShare: number | null;
  bookValue: number | null;
  revenuePerShare: number | null;
  // Liquidez
  currentRatio: number | null;
  quickRatio: number | null;
  totalCash: number | null;
  totalDebt: number | null;
  totalRevenue: number | null;
  ebitda: number | null;
}

interface IndicatorsClientProps {
  symbols: string[];
}

// ─── Formatters ──────────────────────────────────────────────────────────────

const ACCENT = "#3b82f6";

function fmtBRL(n: number | null) {
  if (n == null) return "–";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(n);
}

function fmtPct(n: number | null) {
  if (n == null) return "–";
  const v = Math.abs(n) > 1 ? n : n * 100;
  return `${v.toFixed(2).replace(".", ",")}%`;
}

function fmtNum(n: number | null, decimals = 2) {
  if (n == null) return "–";
  return n.toFixed(decimals).replace(".", ",");
}

function fmtLarge(n: number | null) {
  if (n == null) return "–";
  if (Math.abs(n) >= 1e12) return `R$ ${(n / 1e12).toFixed(2).replace(".", ",")}T`;
  if (Math.abs(n) >= 1e9)  return `R$ ${(n / 1e9).toFixed(2).replace(".", ",")}B`;
  if (Math.abs(n) >= 1e6)  return `R$ ${(n / 1e6).toFixed(2).replace(".", ",")}M`;
  return fmtBRL(n);
}

// ─── Indicator Card ──────────────────────────────────────────────────────────

function KPI({
  label, value, description, positive,
}: {
  label: string;
  value: string;
  description?: string;
  positive?: boolean | null;
}) {
  return (
    <div className="bg-secondary/30 rounded-xl p-3 flex flex-col gap-1 group relative">
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
        {description && (
          <div className="relative">
            <Info className="h-3 w-3 text-muted-foreground/50 cursor-help" />
            <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block bg-popover border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-muted-foreground w-48 z-10 shadow-lg">
              {description}
            </div>
          </div>
        )}
      </div>
      <p
        className="text-base font-bold"
        style={{ color: positive === true ? "#22c55e" : positive === false ? "#ef4444" : "var(--foreground)" }}
      >
        {value}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <span className="w-1 h-4 rounded-full inline-block" style={{ backgroundColor: ACCENT }} />
        {title}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {children}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function IndicatorsClient({ symbols }: IndicatorsClientProps) {
  const [selectedSymbol, setSelectedSymbol] = useState<string>(symbols[0] ?? "");
  const [fundamentals, setFundamentals] = useState<Fundamentals | null>(null);
  const [bolsaiData, setBolsaiData] = useState<unknown>(null);
  const [bolsaiError, setBolsaiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIndicators = useCallback(async (symbol: string) => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    setBolsaiData(null);
    setBolsaiError(null);
    try {
      const res = await fetch(`/api/investments/indicators?symbol=${symbol}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Erro ao carregar indicadores");
        setFundamentals(null);
        return;
      }
      setFundamentals(json.fundamentals ?? null);
      setBolsaiData(json.bolsaiData ?? null);
      setBolsaiError(json.bolsaiError ?? null);
    } catch {
      setError("Erro de rede");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSymbol) fetchIndicators(selectedSymbol);
  }, [selectedSymbol, fetchIndicators]);

  if (symbols.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center px-6">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(59,130,246,0.1)" }}>
          <Activity className="w-7 h-7" style={{ color: ACCENT }} />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Nenhum ativo na carteira</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Adicione ativos na aba <strong>Cotações</strong> para ver indicadores.
          </p>
        </div>
      </div>
    );
  }

  const f = fundamentals;
  const isUp = (f?.regularMarketChange ?? 0) >= 0;

  return (
    <div className="space-y-5">
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
                : { color: "var(--muted-foreground)", border: "1px solid var(--border)" }
            }
          >
            {s}
          </button>
        ))}
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
      {!loading && !error && f && (
        <>
          {/* Header */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {f.logourl ? (
                <img src={f.logourl} alt={f.symbol} className="h-10 w-10 rounded-xl object-contain bg-secondary" />
              ) : (
                <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: ACCENT }}>
                  {f.symbol.slice(0, 2)}
                </div>
              )}
              <div>
                <p className="font-bold text-foreground text-lg">{f.symbol}</p>
                <p className="text-sm text-muted-foreground">{f.shortName}</p>
              </div>
            </div>
            <div className="flex items-end gap-3">
              <div className="text-right">
                <p className="text-2xl font-bold text-foreground">{fmtBRL(f.regularMarketPrice)}</p>
                <div className="flex items-center gap-1 justify-end mt-0.5">
                  {isUp
                    ? <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                    : <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
                  <span className="text-sm font-semibold" style={{ color: isUp ? "#22c55e" : "#ef4444" }}>
                    {fmtBRL(f.regularMarketChange)} ({fmtPct(f.regularMarketChangePercent)})
                  </span>
                </div>
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-[10px] text-muted-foreground">Cap. Mercado</p>
                <p className="text-sm font-bold text-foreground">{fmtLarge(f.marketCap)}</p>
              </div>
            </div>
          </div>

          {/* Valuation */}
          <Section title="Valuation">
            <KPI label="P/L" value={fmtNum(f.priceEarnings)} description="Preço / Lucro por ação. Indica quantos anos levaria para recuperar o investimento via lucro." />
            <KPI label="P/VP" value={fmtNum(f.priceToBook)} description="Preço / Valor Patrimonial. Abaixo de 1 indica que a ação está abaixo do patrimônio líquido." />
            <KPI label="P/SR" value={fmtNum(f.priceToSalesTrailing12Months)} description="Preço / Receita Líquida (12 meses)." />
            <KPI label="P/L Forward" value={fmtNum(f.forwardPE)} description="P/L projetado com base no lucro estimado para os próximos 12 meses." />
            <KPI label="PEG" value={fmtNum(f.pegRatio)} description="P/L ajustado pelo crescimento do lucro. Abaixo de 1 pode indicar subavaliação." />
            <KPI label="DY" value={fmtPct(f.dividendYield)} description="Dividend Yield: dividendo pago por ação / preço da ação." positive={f.dividendYield != null ? f.dividendYield > 0 : null} />
            <KPI label="DPA" value={fmtBRL(f.dividendsPerShare)} description="Dividendo por ação pago nos últimos 12 meses." />
            <KPI label="Beta" value={fmtNum(f.beta)} description="Volatilidade relativa ao mercado. Beta > 1 indica maior oscilação que o índice." />
          </Section>

          {/* Rentabilidade */}
          <Section title="Rentabilidade">
            <KPI label="ROE" value={fmtPct(f.returnOnEquity)} description="Retorno sobre o Patrimônio Líquido. Mede a eficiência do uso do capital próprio." positive={f.returnOnEquity != null ? f.returnOnEquity > 0.1 : null} />
            <KPI label="ROA" value={fmtPct(f.returnOnAssets)} description="Retorno sobre o Total de Ativos." positive={f.returnOnAssets != null ? f.returnOnAssets > 0.05 : null} />
            <KPI label="Margem Bruta" value={fmtPct(f.grossMargins)} description="(Receita - CMV) / Receita. Indica eficiência operacional bruta." positive={f.grossMargins != null ? f.grossMargins > 0.2 : null} />
            <KPI label="Margem EBITDA" value={fmtPct(f.ebitdaMargins)} description="EBITDA / Receita. Eficiência operacional antes de juros, impostos, depreciação." positive={f.ebitdaMargins != null ? f.ebitdaMargins > 0.15 : null} />
            <KPI label="Margem Op." value={fmtPct(f.operatingMargins)} description="Lucro Operacional / Receita." positive={f.operatingMargins != null ? f.operatingMargins > 0 : null} />
            <KPI label="Margem Líq." value={fmtPct(f.profitMargins)} description="Lucro Líquido / Receita." positive={f.profitMargins != null ? f.profitMargins > 0 : null} />
          </Section>

          {/* Crescimento */}
          <Section title="Crescimento (12m)">
            <KPI label="Cresc. Receita" value={fmtPct(f.revenueGrowth)} description="Variação da receita nos últimos 12 meses." positive={f.revenueGrowth != null ? f.revenueGrowth > 0 : null} />
            <KPI label="Cresc. Lucro" value={fmtPct(f.earningsGrowth)} description="Variação do lucro por ação nos últimos 12 meses." positive={f.earningsGrowth != null ? f.earningsGrowth > 0 : null} />
            <KPI label="Receita Total" value={fmtLarge(f.totalRevenue)} description="Receita líquida total dos últimos 12 meses." />
            <KPI label="EBITDA" value={fmtLarge(f.ebitda)} description="Lucro antes de juros, impostos, depreciação e amortização." positive={f.ebitda != null ? f.ebitda > 0 : null} />
          </Section>

          {/* Por Ação */}
          <Section title="Por Ação">
            <KPI label="LPA" value={fmtBRL(f.earningsPerShare)} description="Lucro por ação (EPS) dos últimos 12 meses." positive={f.earningsPerShare != null ? f.earningsPerShare > 0 : null} />
            <KPI label="VPA" value={fmtBRL(f.bookValue)} description="Valor patrimonial por ação = Patrimônio Líquido / Nº de ações." />
            <KPI label="Rec./Ação" value={fmtBRL(f.revenuePerShare)} description="Receita líquida por ação dos últimos 12 meses." />
          </Section>

          {/* Liquidez e Endividamento */}
          <Section title="Liquidez e Endividamento">
            <KPI label="Liq. Corrente" value={fmtNum(f.currentRatio)} description="Ativo Circulante / Passivo Circulante. Acima de 1 indica boa liquidez de curto prazo." positive={f.currentRatio != null ? f.currentRatio > 1 : null} />
            <KPI label="Liq. Rápida" value={fmtNum(f.quickRatio)} description="(Ativo Circulante - Estoques) / Passivo Circulante." positive={f.quickRatio != null ? f.quickRatio > 1 : null} />
            <KPI label="Caixa Total" value={fmtLarge(f.totalCash)} description="Caixa + equivalentes de caixa e aplicações de curto prazo." positive={f.totalCash != null ? true : null} />
            <KPI label="Dívida Total" value={fmtLarge(f.totalDebt)} description="Dívida bruta total (curto + longo prazo)." />
            <KPI label="EV" value={fmtLarge(f.enterpriseValue)} description="Enterprise Value = Cap. Mercado + Dívida Líquida. Valor total da empresa." />
          </Section>

          {/* Bolsai AI section — if data available */}
          {bolsaiData && (
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <span className="w-1 h-4 rounded-full inline-block" style={{ backgroundColor: ACCENT }} />
                Análise IA — Bolsai
              </h3>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words bg-secondary/30 rounded-lg p-3 overflow-auto max-h-64">
                {JSON.stringify(bolsaiData, null, 2)}
              </pre>
            </div>
          )}

          {/* Bolsai error note */}
          {bolsaiError && !bolsaiData && (
            <p className="text-xs text-muted-foreground/60 text-center">
              Dados adicionais Bolsai indisponíveis: {bolsaiError}
            </p>
          )}
        </>
      )}
    </div>
  );
}

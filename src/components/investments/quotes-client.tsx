"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, RefreshCw, Search, TrendingUp, TrendingDown,
  Loader2, X, AlertCircle,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface QuoteResult {
  symbol: string;
  shortName: string;
  longName?: string;
  currency: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketOpen: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  regularMarketVolume: number;
  regularMarketPreviousClose: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  fiftyTwoWeekChange?: number;
  marketCap?: number;
  priceEarnings?: number;
  earningsPerShare?: number;
  logourl?: string;
  regularMarketTime?: number;
  error?: string;
}

interface QuotesClientProps {
  profileId: string;
  initialSymbols: string[];
  initialQuotes: QuoteResult[];
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function fmtBRL(n: number | undefined) {
  if (n == null || isNaN(n)) return "–";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", minimumFractionDigits: 2,
  }).format(n);
}

function fmtPct(n: number | undefined) {
  if (n == null || isNaN(n)) return "–";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2).replace(".", ",")}%`;
}

function fmtVol(n: number | undefined) {
  if (!n) return "–";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(".", ",")}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", ",")}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
}

function fmtMktCap(n: number | undefined) {
  if (!n) return "–";
  if (n >= 1e12) return `R$ ${(n / 1e12).toFixed(2).replace(".", ",")}T`;
  if (n >= 1e9) return `R$ ${(n / 1e9).toFixed(2).replace(".", ",")}B`;
  if (n >= 1e6) return `R$ ${(n / 1e6).toFixed(1).replace(".", ",")}M`;
  return fmtBRL(n);
}

// ─── Quote Card ─────────────────────────────────────────────────────────────

function QuoteCard({
  quote,
  onRemove,
  removing,
  onCardClick,
}: {
  quote: QuoteResult;
  onRemove: () => void;
  removing: boolean;
  onCardClick: () => void;
}) {
  const up = quote.regularMarketChange >= 0;
  const color = up ? "#22c55e" : "#ef4444";
  const badgeBg = up ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)";

  const w52Range = (quote.fiftyTwoWeekHigh ?? 0) - (quote.fiftyTwoWeekLow ?? 0);
  const w52Pos = w52Range > 0
    ? Math.min(100, Math.max(0, Math.round(((quote.regularMarketPrice - (quote.fiftyTwoWeekLow ?? 0)) / w52Range) * 100)))
    : 50;

  const stats = [
    { label: "Abert.", value: fmtBRL(quote.regularMarketOpen) },
    { label: "Máx.", value: fmtBRL(quote.regularMarketDayHigh) },
    { label: "Mín.", value: fmtBRL(quote.regularMarketDayLow) },
    { label: "Volume", value: fmtVol(quote.regularMarketVolume) },
    { label: "Cap.", value: fmtMktCap(quote.marketCap) },
    { label: "P/L", value: quote.priceEarnings != null ? quote.priceEarnings.toFixed(1).replace(".", ",") : "–" },
  ];

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Header: logo + symbol + name | price + change + trash */}
      <div
        className="px-4 pt-3 pb-2.5 flex items-center gap-2 cursor-pointer"
        onClick={onCardClick}
      >
        {quote.logourl ? (
          <img
            src={quote.logourl}
            alt={quote.symbol}
            className="h-7 w-7 rounded-md object-contain flex-shrink-0 bg-secondary"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div
            className="h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 text-white font-bold text-[10px]"
            style={{ backgroundColor: "#3b82f6" }}
          >
            {quote.symbol.slice(0, 2)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm text-foreground leading-tight">{quote.symbol}</p>
          <p className="text-[11px] text-muted-foreground truncate leading-tight">{quote.shortName}</p>
        </div>

        {/* Price + change badge */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right">
            <p className="font-bold text-sm text-foreground leading-tight">{fmtBRL(quote.regularMarketPrice)}</p>
            <div
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-semibold"
              style={{ backgroundColor: badgeBg, color }}
            >
              {up
                ? <TrendingUp className="h-3 w-3" />
                : <TrendingDown className="h-3 w-3" />}
              {fmtPct(quote.regularMarketChangePercent)}
            </div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onRemove(); }}
            disabled={removing}
            className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded flex-shrink-0"
            aria-label="Remover ativo"
          >
            {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="px-4 pb-2.5 grid grid-cols-6 gap-1">
        {stats.map(({ label, value }) => (
          <div key={label} className="bg-secondary/40 rounded px-1 py-1.5 text-center">
            <p className="text-[9px] text-muted-foreground leading-tight">{label}</p>
            <p className="text-[11px] font-semibold text-foreground leading-tight mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {/* 52-week range */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="flex-shrink-0">{fmtBRL(quote.fiftyTwoWeekLow)}</span>
          <div className="relative flex-1 h-1.5 bg-secondary rounded-full">
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${w52Pos}%`, backgroundColor: "#3b82f6" }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-white shadow-sm"
              style={{ left: `calc(${w52Pos}% - 6px)`, backgroundColor: "#3b82f6" }}
            />
          </div>
          <span className="flex-shrink-0">{fmtBRL(quote.fiftyTwoWeekHigh)}</span>
          <span className="text-muted-foreground/60 flex-shrink-0">52s</span>
        </div>
        <p className="text-[10px] text-muted-foreground/40 text-right mt-1.5 select-none">Fonte: BRAPI</p>
      </div>
    </div>
  );
}

// ─── Add Dialog ──────────────────────────────────────────────────────────────

function AddTickerDialog({
  open,
  onClose,
  existingSymbols,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  existingSymbols: string[];
  onAdd: (symbol: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) { setQuery(""); setResults([]); }
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/investments/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setResults((data.stocks ?? []).slice(0, 20));
        }
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  async function handleAdd(symbol: string) {
    setAdding(symbol);
    await onAdd(symbol);
    setAdding(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adicionar ativo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Buscar ticker (ex: PETR4, VALE3...)"
              value={query}
              onChange={(e) => setQuery(e.target.value.toUpperCase())}
              className="pl-9"
            />
            {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {results.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {results.map((symbol) => {
                const already = existingSymbols.includes(symbol);
                return (
                  <button
                    key={symbol}
                    onClick={() => !already && handleAdd(symbol)}
                    disabled={already || adding === symbol}
                    className="w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-secondary/60 transition-colors disabled:opacity-50 flex items-center justify-between"
                  >
                    <span>{symbol}</span>
                    {already ? (
                      <span className="text-xs text-muted-foreground">Já adicionado</span>
                    ) : adding === symbol ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {!searching && query.length >= 2 && results.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">Nenhum ativo encontrado.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

const REFRESH_INTERVAL = 60;

export function QuotesClient({ profileId, initialSymbols, initialQuotes }: QuotesClientProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [symbols, setSymbols] = useState<string[]>(initialSymbols);
  const [quotes, setQuotes] = useState<QuoteResult[]>(initialQuotes);
  const [loading, setLoading] = useState(initialQuotes.length === 0 && initialSymbols.length > 0);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [removingSymbol, setRemovingSymbol] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(initialQuotes.length > 0 ? new Date() : null);

  const fetchQuotes = useCallback(async (syms: string[], silent = false) => {
    if (syms.length === 0) { setQuotes([]); return; }
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch(`/api/investments/quotes?symbols=${syms.join(",")}`);
      const data = await res.json();
      if (!res.ok) {
        const detail = data?.detail ?? data?.error ?? `HTTP ${res.status}`;
        if (!silent) toast({ variant: "destructive", title: "Erro ao buscar cotações", description: detail });
        return;
      }
      setQuotes(data.results ?? []);
      setLastUpdated(new Date());
      setCountdown(REFRESH_INTERVAL);
    } catch (err) {
      if (!silent) toast({ variant: "destructive", title: "Erro de rede", description: String(err) });
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [toast]);

  // Initial fetch if no server-side quotes
  useEffect(() => {
    if (initialQuotes.length === 0 && initialSymbols.length > 0) {
      fetchQuotes(initialSymbols);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh countdown
  useEffect(() => {
    if (symbols.length === 0) return;
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          fetchQuotes(symbols, true);
          return REFRESH_INTERVAL;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [symbols, fetchQuotes]);

  async function handleAdd(symbol: string) {
    const supabase = createClient();
    const { error } = await supabase.from("investment_tickers").insert({ profile_id: profileId, symbol });
    if (error) {
      toast({ variant: "destructive", title: "Erro ao adicionar", description: error.message });
      return;
    }
    const newSymbols = [...symbols, symbol];
    setSymbols(newSymbols);
    toast({ title: `${symbol} adicionado!` });
    await fetchQuotes(newSymbols);
  }

  async function handleRemove(symbol: string) {
    setRemovingSymbol(symbol);
    const supabase = createClient();
    await supabase.from("investment_tickers").delete().eq("profile_id", profileId).eq("symbol", symbol);
    const newSymbols = symbols.filter((s) => s !== symbol);
    setSymbols(newSymbols);
    setQuotes((prev) => prev.filter((q) => q.symbol !== symbol));
    setRemovingSymbol(null);
    toast({ title: `${symbol} removido` });
  }

  const filteredQuotes = filter.trim()
    ? quotes.filter(
        (q) =>
          q.symbol.toLowerCase().includes(filter.toLowerCase()) ||
          q.shortName?.toLowerCase().includes(filter.toLowerCase())
      )
    : quotes;

  const fmtTime = (d: Date) =>
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchQuotes(symbols)}
            disabled={refreshing || symbols.length === 0}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          {lastUpdated && symbols.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">
                Atualizado às {fmtTime(lastUpdated)}
              </span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">próx. {countdown}s</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {symbols.length > 0 && (
            <div className="relative flex-1 sm:flex-none sm:w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filtrar ativos..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
              {filter && (
                <button onClick={() => setFilter("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          )}
          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            className="gap-1.5 text-white flex-shrink-0"
            style={{ backgroundColor: "#3b82f6" }}
          >
            <Plus className="h-4 w-4" />
            Adicionar ativo
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#3b82f6" }} />
          <p className="text-sm text-muted-foreground">Carregando cotações...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && symbols.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center px-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(59,130,246,0.1)" }}>
            <TrendingUp className="w-7 h-7" style={{ color: "#3b82f6" }} />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Nenhum ativo monitorado</h3>
            <p className="text-sm text-muted-foreground mt-1">Clique em "Adicionar ativo" para começar a acompanhar ações.</p>
          </div>
          <Button
            onClick={() => setAddOpen(true)}
            className="gap-1.5 text-white"
            style={{ backgroundColor: "#3b82f6" }}
          >
            <Plus className="h-4 w-4" />
            Adicionar ativo
          </Button>
        </div>
      )}

      {/* Error quotes */}
      {!loading && filteredQuotes.some((q) => q.error) && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          Alguns ativos não puderam ser carregados. Verifique se os tickers estão corretos.
        </div>
      )}

      {/* Quotes grid */}
      {!loading && filteredQuotes.filter((q) => !q.error).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredQuotes
            .filter((q) => !q.error)
            .map((quote) => (
              <QuoteCard
                key={quote.symbol}
                quote={quote}
                onRemove={() => handleRemove(quote.symbol)}
                removing={removingSymbol === quote.symbol}
                onCardClick={() => router.push(`/investments/charts?symbol=${quote.symbol}`)}
              />
            ))}
        </div>
      )}

      {!loading && filter && filteredQuotes.length === 0 && symbols.length > 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">
          Nenhum ativo corresponde a "{filter}".
        </p>
      )}

      <AddTickerDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        existingSymbols={symbols}
        onAdd={handleAdd}
      />
    </div>
  );
}

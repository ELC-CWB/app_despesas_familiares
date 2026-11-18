"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  PERIODOS_GRAFICO, PERIODO_PADRAO, variacaoPercentual, type PeriodoId, type PontoGrafico,
} from "@/lib/carteira/ativo-grafico";

// Popup com o gráfico de preço do ativo (ícone ao lado do ticker na tabela Real x planejado).
// Fecha por X, Esc ou clique fora (Radix). Dados de /api/carteira/ativo-grafico; guardamos por ativo e período.
type Serie = { moeda: string | null; pontos: PontoGrafico[] };
const memoria = new Map<string, Serie>();

const COR = "#3b6ea5";

function dataCurta(iso: string, curto: boolean): string {
  const [a, m, d] = iso.split("-");
  return curto ? `${d}/${m}` : `${m}/${a.slice(2)}`;
}

function dataLonga(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function moedaFmt(valor: number, moeda: string | null): string {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda ?? "BRL" }).format(valor);
  } catch {
    return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}

export function AtivoGraficoDialog({ codigo, onClose }: { codigo: string | null; onClose: () => void }) {
  return (
    <Dialog open={!!codigo} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
        {/* O conteúdo só existe com o popup aberto: o período volta para 1 ano a cada abertura */}
        {codigo && <Conteudo codigo={codigo} />}
      </DialogContent>
    </Dialog>
  );
}

function Conteudo({ codigo }: { codigo: string }) {
  const [periodo, setPeriodo] = useState<PeriodoId>(PERIODO_PADRAO);
  const chave = `${codigo}:${periodo}`;
  // O estado só muda dentro dos callbacks da busca; "carregando" é derivado
  const [res, setRes] = useState<{ chave: string; serie?: Serie; erro?: string } | null>(null);
  const atual = res?.chave === chave ? res : null;
  const serie = memoria.get(chave) ?? atual?.serie ?? null;
  const erro = atual?.erro ?? null;
  const carregando = !serie && !erro;

  useEffect(() => {
    if (memoria.has(chave)) return;
    let cancelado = false;
    fetch(`/api/carteira/ativo-grafico?codigo=${encodeURIComponent(codigo)}&periodo=${periodo}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error ?? "Não foi possível carregar o gráfico agora.");
        return { moeda: j.moeda ?? null, pontos: j.pontos ?? [] } as Serie;
      })
      .then((s) => { memoria.set(chave, s); if (!cancelado) setRes({ chave, serie: s }); })
      .catch((e: Error) => { if (!cancelado) setRes({ chave, erro: e.message }); });
    return () => { cancelado = true; };
  }, [chave, codigo, periodo]);

  const pontos = serie?.pontos;
  const ultimo = pontos?.length ? pontos[pontos.length - 1] : null;
  const variacao = useMemo(() => (pontos ? variacaoPercentual(pontos) : null), [pontos]);
  const curto = periodo === "1m" || periodo === "3m";

  return (
    <>
      <DialogHeader className="pr-6">
        <DialogTitle style={{ fontFamily: "Sora, sans-serif" }}>{codigo}</DialogTitle>
        <DialogDescription>
          {ultimo && serie
            ? <>
                Fechamento de {dataLonga(ultimo.data)}: <strong className="text-foreground">{moedaFmt(ultimo.fechamento, serie.moeda)}</strong>
                {variacao != null && (
                  <span className={variacao >= 0 ? "text-emerald-600" : "text-red-600"}>
                    {" "}· {variacao >= 0 ? "+" : "−"}{Math.abs(variacao).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% no período
                  </span>
                )}
              </>
            : "Preço do ativo ao longo do tempo"}
        </DialogDescription>
      </DialogHeader>

      <div role="group" aria-label="Período do gráfico" className="flex flex-wrap gap-1.5">
        {PERIODOS_GRAFICO.map((p) => (
          <button key={p.id} type="button" onClick={() => setPeriodo(p.id)} aria-pressed={periodo === p.id}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              periodo === p.id
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}>
            {p.rotulo}
          </button>
        ))}
      </div>

      <div className="h-64 sm:h-72">
        {carregando && (
          <p className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando gráfico…
          </p>
        )}
        {erro && <p className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">{erro}</p>}
        {serie && pontos && pontos.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={pontos} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ativoGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COR} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={COR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="data" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={40}
                tickFormatter={(v: string) => dataCurta(v, curto)} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={52}
                tickFormatter={(v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: v < 10 ? 2 : 0 })} />
              <Tooltip
                labelFormatter={(v) => dataLonga(String(v))}
                formatter={(v) => [moedaFmt(Number(v), serie.moeda), "Fechamento"]}
                contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", fontSize: "13px" }} />
              <Area type="monotone" dataKey="fechamento" stroke={COR} strokeWidth={2} fill="url(#ativoGrad)"
                dot={false} activeDot={{ r: 4, fill: COR }} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Preço de fechamento na moeda de negociação, conforme o Yahoo Finance. Dados históricos, sem recomendação de investimento.
      </p>
    </>
  );
}

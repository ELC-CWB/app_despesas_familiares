"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fmtBRL, fmtNum } from "@/lib/carteira/numeros";
import type { EscolhaSaque, EstadoUsufruto } from "@/lib/carteira/usufruto";
import { ACCENT, inputCls } from "@/components/carteira/campos";

// Usufruto na Visão geral (SPEC §4.2): saque do mês com o ativo escolhido, cobertura do colchão e
// sugestões de ajuste da retirada (Aceitar | Recusar). O app sugere, o usuário decide.

const AMBAR = "#8A5A00";
const VERMELHO = "#B42318";
const brl = (v: number) => fmtBRL(v, 0);

const MOTIVO: Record<EscolhaSaque["motivo"], string> = {
  brasil: "Maior excesso entre os ativos do Brasil, sem custo de câmbio.",
  exterior: "Nenhum ativo do Brasil está acima do alvo; este é o do exterior com maior excesso (tem custo de câmbio na volta).",
  colchao: "Nenhum ativo está acima do alvo: o saque sai do colchão de liquidez, para não vender ações em queda.",
  mais_perto: "Nenhum ativo acima do alvo e sem colchão definido: vende o ativo mais perto do alvo.",
  sem_ativo: "Sem posições para vender.",
};

export function UsufrutoCard({ estado, podeEditar }: { estado: EstadoUsufruto; podeEditar: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [enviando, setEnviando] = useState<"aceito" | "recusado" | null>(null);
  const { escolha, colchao, alerta } = estado;

  const decidir = async (decisao: "aceito" | "recusado") => {
    if (!alerta) return;
    setEnviando(decisao);
    try {
      const res = await fetch("/api/carteira/usufruto", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decisao, tipo: alerta.tipo }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Erro ao registrar a decisão");
      toast({ title: decisao === "aceito" ? "Retirada ajustada" : "Sugestão recusada" });
      router.refresh();
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setEnviando(null);
    }
  };

  return (
    <div className="space-y-2">
      {alerta && (
        <div className="rounded-xl px-3 py-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
          style={{ backgroundColor: alerta.tipo === "protecao" ? "rgba(180,35,24,0.08)" : "rgba(46,107,63,0.08)" }}>
          <div className="min-w-0 text-sm">
            {alerta.tipo === "protecao" && (
              <>
                <p className="font-bold" style={{ color: VERMELHO }}>Proteção nas quedas</p>
                <p className="text-xs text-foreground/80">
                  A carteira está {fmtNum(alerta.queda_pct, 1, 1)}% abaixo do pico. Sugestão: reduzir a retirada de {brl(alerta.valor_anterior)} para {brl(alerta.novo_valor)} por mês
                  até a carteira recuperar o pico.
                </p>
              </>
            )}
            {alerta.tipo === "retorno_pico" && (
              <>
                <p className="font-bold" style={{ color: "#2E6B3F" }}>A carteira recuperou o pico</p>
                <p className="text-xs text-foreground/80">Sugestão: voltar a retirada ao valor anterior, {brl(alerta.novo_valor)} por mês.</p>
              </>
            )}
            {alerta.tipo === "aumento" && (
              <>
                <p className="font-bold" style={{ color: "#2E6B3F" }}>Revisão anual: a carteira cresceu</p>
                <p className="text-xs text-foreground/80">
                  A retirada anual é {fmtNum(alerta.retirada_pct, 1, 2)}% do saldo. Sugestão: aumentar a retirada para {brl(alerta.novo_valor)} por mês.
                </p>
              </>
            )}
          </div>
          {podeEditar && (
            <div className="flex gap-2 flex-none">
              <button type="button" disabled={!!enviando} onClick={() => decidir("aceito")}
                className="px-3 py-1.5 rounded-md text-xs font-semibold text-white disabled:opacity-60 inline-flex items-center gap-1.5"
                style={{ backgroundColor: ACCENT }}>
                {enviando === "aceito" && <Loader2 className="h-3 w-3 animate-spin" />}Aceitar
              </button>
              <button type="button" disabled={!!enviando} onClick={() => decidir("recusado")}
                className="px-3 py-1.5 rounded-md text-xs font-semibold border border-border hover:bg-secondary/50 disabled:opacity-60 inline-flex items-center gap-1.5">
                {enviando === "recusado" && <Loader2 className="h-3 w-3 animate-spin" />}Recusar
              </button>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl p-3" style={{ backgroundColor: "rgba(138,90,0,0.08)" }}>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide leading-tight" style={{ color: AMBAR }}>Saque do mês</p>
            <p className="text-xl font-bold text-foreground tabular-nums leading-tight">{fmtBRL(estado.saque, 2)}</p>
          </div>

          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">Vender</p>
            {escolha ? (
              <p className="text-sm text-muted-foreground leading-tight">
                <strong className="text-base text-foreground">{escolha.codigo}</strong>
                {escolha.motivo === "brasil" || escolha.motivo === "exterior"
                  ? <> · {brl(escolha.excesso)} acima do alvo</> : null}
              </p>
            ) : <p className="text-sm text-muted-foreground">Sem ativo para vender</p>}
          </div>

          {colchao && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">Colchão ({colchao.codigo})</p>
              <p className="text-sm font-semibold leading-tight tabular-nums" style={{ color: colchao.abaixo ? VERMELHO : "#2E6B3F" }}>
                {colchao.meses == null ? "—" : `cobre ${colchao.meses} ${colchao.meses === 1 ? "mês" : "meses"}`}
                <span className="font-normal text-muted-foreground"> · mínimo {colchao.minimo}</span>
              </p>
            </div>
          )}

          {podeEditar && escolha && (
            <Link href={`/investments/movimentacoes?op=venda&ativo=${encodeURIComponent(escolha.codigo)}&valor=${estado.saque.toFixed(2)}`}
              className="px-2.5 py-1.5 rounded-md text-xs font-semibold text-white whitespace-nowrap flex-none" style={{ backgroundColor: ACCENT }}>
              Registrar venda
            </Link>
          )}
        </div>

        {escolha?.fica_abaixo && (
          <p className="text-xs mt-2" style={{ color: AMBAR }}>
            O saque é maior que o excesso de {escolha.codigo}: ele vai ficar um pouco abaixo do alvo.
          </p>
        )}
        {colchao?.abaixo && (
          <p className="text-xs mt-1" style={{ color: VERMELHO }}>
            O colchão cobre menos que o mínimo de {colchao.minimo} meses de saque. Reforce o colchão nos próximos aportes.
          </p>
        )}

        <details className="group mt-2">
          <summary className="flex items-center gap-1 text-xs font-semibold text-muted-foreground cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />Como o ativo é escolhido
          </summary>
          <div className="mt-1.5 text-xs text-muted-foreground space-y-1">
            {escolha && <p><strong className="text-foreground">Agora:</strong> {MOTIVO[escolha.motivo]}</p>}
            <ol className="list-decimal pl-4 space-y-0.5">
              <li>O ativo do Brasil com maior excesso sobre o alvo, porque não tem custo de câmbio.</li>
              <li>Sem nenhum acima, o ativo do exterior com maior excesso.</li>
              <li>Sem nenhum acima do alvo, o colchão de liquidez, para não vender ações em queda.</li>
              <li>Sem colchão definido, o ativo mais perto do alvo.</li>
            </ol>
            <p>O saque é corrigido pelo IPCA a cada aniversário do início do usufruto ({estado.inicio.split("-").reverse().join("/")}).</p>
          </div>
        </details>
      </div>
    </div>
  );
}

// Passagem da acumulação para o usufruto: o saque inicial é o patrimônio de hoje × retirada% do plano ÷ 12
export function IniciarUsufruto({
  hoje, patrimonio, retiradaPct,
}: { hoje: string; patrimonio: number; retiradaPct: number | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [inicio, setInicio] = useState(hoje);
  const [salvando, setSalvando] = useState(false);
  const saque = retiradaPct == null ? null : (patrimonio * retiradaPct) / 1200;

  const iniciar = async () => {
    setSalvando(true);
    try {
      const res = await fetch("/api/carteira/usufruto", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inicio }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Erro ao iniciar o usufruto");
      toast({ title: "Usufruto iniciado" });
      router.refresh();
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvando(false);
    }
  };

  if (!aberto) {
    return (
      <div className="flex justify-end">
        <button type="button" onClick={() => setAberto(true)} className="text-xs font-semibold underline-offset-2 hover:underline" style={{ color: ACCENT }}>
          Iniciar usufruto
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      <p className="text-sm font-bold text-foreground">Iniciar o usufruto</p>
      {saque == null ? (
        <p className="text-xs text-muted-foreground">
          Salve um plano antes: o saque inicial vem da retirada anual do plano.{" "}
          <Link href="/investments/plano" className="underline">Ir para o Plano</Link>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          A partir da data escolhida, o app passa a sugerir o saque do mês. Saque inicial: {fmtNum(retiradaPct ?? 0, 0, 2)}% ao ano sobre o patrimônio de hoje ({fmtBRL(patrimonio, 0)}),
          ou <strong className="text-foreground">{fmtBRL(saque, 2)}</strong> por mês, corrigido pelo IPCA a cada ano.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] font-semibold text-muted-foreground">
          <span className="block mb-1">Início</span>
          <input type="date" value={inicio} max={hoje} onChange={(e) => setInicio(e.target.value)} className={`${inputCls} h-8 py-0 text-xs w-40`} />
        </label>
        <button type="button" disabled={salvando || saque == null || !inicio} onClick={iniciar}
          className="h-8 px-3 rounded-md text-xs font-semibold text-white disabled:opacity-60 inline-flex items-center gap-1.5" style={{ backgroundColor: ACCENT }}>
          {salvando && <Loader2 className="h-3 w-3 animate-spin" />}Iniciar usufruto
        </button>
        <button type="button" disabled={salvando} onClick={() => setAberto(false)}
          className="h-8 px-3 rounded-md text-xs font-semibold border border-border hover:bg-secondary/50">
          Cancelar
        </button>
      </div>
    </div>
  );
}

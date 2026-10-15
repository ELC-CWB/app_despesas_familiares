"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fmtBRL, fmtNum } from "@/lib/carteira/numeros";
import { NOME_CATEGORIA, situacaoDarf, type AnoExterior, type AvisoIR, type CategoriaIR, type MesB3, type MesFonte } from "@/lib/carteira/ir";
import { ACCENT } from "@/components/carteira/campos";

// Imposto de renda (REGRAS §7), parte 1: DARF mensal da B3, prejuízo a compensar, exterior (anual) e renda
// fixa retida na fonte. É uma ESTIMATIVA calculada das movimentações; não substitui um contador.

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesAno = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;
const data = (iso: string) => iso.split("-").reverse().join("/");
const VERMELHO = "#B42318";
const VERDE = "#2E6B3F";
const AMBAR = "#8A5A00";

export function IrSection({
  meses, anosExterior, fonte, avisos, pagos, hoje, podeEditar,
}: {
  meses: MesB3[]; anosExterior: AnoExterior[]; fonte: MesFonte[]; avisos: AvisoIR[]; pagos: string[]; hoje: string; podeEditar: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [salvando, setSalvando] = useState<string | null>(null);
  const setPagos = new Set(pagos);
  const vazio = !meses.length && !anosExterior.length && !fonte.length;

  const marcar = async (competencia: string, pago: boolean) => {
    setSalvando(competencia);
    try {
      const res = await fetch("/api/carteira/ir", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ competencia, pago }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar");
      router.refresh();
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvando(null);
    }
  };

  // Prejuízo ainda a compensar, por categoria (saldo depois do último mês apurado)
  const saldos = new Map<CategoriaIR, number>();
  for (const m of meses) for (const c of m.categorias) saldos.set(c.categoria, c.prejuizoFinal);
  const saldoExterior = anosExterior.at(-1)?.prejuizoFinal ?? 0;
  const comSaldo = [...saldos].filter(([, v]) => v > 0.005);

  return (
    <details className="group rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <summary className="px-4 py-3 cursor-pointer flex items-center justify-between gap-2 list-none [&::-webkit-details-marker]:hidden hover:bg-secondary/30 transition-colors">
        <span className="flex items-center gap-2">
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform -rotate-90 group-open:rotate-0" aria-hidden />
          <span className="text-base font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>Imposto de renda (estimativa)</span>
        </span>
        <span className="text-xs text-muted-foreground">DARF, prejuízo a compensar e exterior</span>
      </summary>

      <div className="border-t border-border p-4 space-y-4">
        <p className="text-xs text-muted-foreground">
          Estimativa calculada das suas movimentações, com as alíquotas de Configurações. Não substitui um contador:
          confira os valores antes de pagar o DARF ou declarar.
        </p>

        {vazio && <p className="text-sm text-muted-foreground">Ainda não há vendas registradas, então não há imposto a apurar.</p>}

        {avisos.length > 0 && (
          <div className="rounded-lg px-3 py-2 text-xs space-y-0.5" style={{ color: AMBAR, backgroundColor: "rgba(138,90,0,0.10)" }}>
            {avisos.slice(0, 5).map((a, i) => <p key={i}><strong>{a.codigo}</strong> em {data(a.data)}: {a.texto}</p>)}
            {avisos.length > 5 && <p>E mais {avisos.length - 5} aviso(s).</p>}
          </div>
        )}

        {meses.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-sm font-bold text-foreground">DARF mensal (renda variável na B3)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] min-w-[560px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="py-1 text-left font-semibold">Mês</th>
                    <th className="py-1 text-right font-semibold">Resultado</th>
                    <th className="py-1 text-right font-semibold">Imposto</th>
                    <th className="py-1 text-right font-semibold">Dedo-duro</th>
                    <th className="py-1 text-right font-semibold">DARF</th>
                    <th className="py-1 text-left font-semibold pl-3">Vencimento</th>
                    <th className="py-1 text-left font-semibold pl-3">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {[...meses].reverse().map((m) => {
                    const sit = situacaoDarf(m, setPagos, hoje);
                    const resultado = m.categorias.reduce((s, c) => s + c.resultado, 0);
                    return (
                      <tr key={m.competencia} className="align-top">
                        <td className="py-1.5 font-semibold">{mesAno(m.competencia)}
                          <span className="block text-[11px] font-normal text-muted-foreground leading-tight">
                            {m.categorias.map((c) =>
                              `${NOME_CATEGORIA[c.categoria]}: ${c.isento ? "isento (vendas até R$ 20 mil)" : c.compensado > 0 ? `compensou ${fmtBRL(c.compensado, 0)}` : c.resultado < 0 ? "prejuízo" : "tributado"}`,
                            ).join(" · ")}
                          </span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums" style={{ color: resultado < 0 ? VERMELHO : undefined }}>{fmtBRL(resultado)}</td>
                        <td className="py-1.5 text-right tabular-nums">{fmtBRL(m.imposto)}</td>
                        <td className="py-1.5 text-right tabular-nums text-muted-foreground">{fmtBRL(m.irrf)}</td>
                        <td className="py-1.5 text-right tabular-nums font-semibold">
                          {m.abaixoMinimo ? <span className="text-muted-foreground font-normal">abaixo de R$ 10</span> : fmtBRL(m.darf)}
                          {m.acumuladoAnterior > 0 && <span className="block text-[11px] font-normal text-muted-foreground">inclui {fmtBRL(m.acumuladoAnterior)} de meses anteriores</span>}
                        </td>
                        <td className="py-1.5 pl-3 whitespace-nowrap">{m.darf > 0 ? data(m.vencimento) : "—"}</td>
                        <td className="py-1.5 pl-3 whitespace-nowrap">
                          {sit === "sem_imposto" ? <span className="text-muted-foreground">{m.abaixoMinimo ? "acumula" : "sem DARF"}</span> : (
                            <span className="inline-flex items-center gap-2">
                              <span className="font-semibold" style={{ color: sit === "pago" ? VERDE : sit === "vencido" ? VERMELHO : AMBAR }}>
                                {sit === "pago" ? "Pago" : sit === "vencido" ? "Vencido" : "A vencer"}
                              </span>
                              {podeEditar && (
                                <button type="button" disabled={salvando === m.competencia} onClick={() => marcar(m.competencia, sit !== "pago")}
                                  className="text-xs font-semibold underline-offset-2 hover:underline disabled:opacity-60 inline-flex items-center gap-1" style={{ color: ACCENT }}>
                                  {salvando === m.competencia && <Loader2 className="h-3 w-3 animate-spin" />}
                                  {sit === "pago" ? "desfazer" : "marcar como pago"}
                                </button>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Código do DARF: 6015. Vencimento no último dia útil do mês seguinte (feriados móveis, como Carnaval, não entram no cálculo).
              O dedo-duro (0,005% sobre a venda) já retido é descontado do imposto. Ações: vendas de até R$ 20 mil no mês, com lucro, são isentas.
            </p>
          </div>
        )}

        {(comSaldo.length > 0 || saldoExterior > 0.005) && (
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground">Prejuízo a compensar</h3>
            <ul className="text-sm text-muted-foreground space-y-0.5">
              {comSaldo.map(([cat, v]) => <li key={cat}>{NOME_CATEGORIA[cat]}: <strong className="text-foreground tabular-nums">{fmtBRL(v)}</strong></li>)}
              {saldoExterior > 0.005 && <li>Exterior: <strong className="text-foreground tabular-nums">{fmtBRL(saldoExterior)}</strong></li>}
            </ul>
            <p className="text-[11px] text-muted-foreground">O prejuízo só compensa ganhos futuros da mesma categoria.</p>
          </div>
        )}

        {anosExterior.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-sm font-bold text-foreground">Exterior (apuração anual, sem DARF mensal)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] min-w-[420px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="py-1 text-left font-semibold">Ano</th>
                    <th className="py-1 text-right font-semibold">Resultado em R$</th>
                    <th className="py-1 text-right font-semibold">Prejuízo compensado</th>
                    <th className="py-1 text-right font-semibold">Alíquota</th>
                    <th className="py-1 text-right font-semibold">Imposto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {[...anosExterior].reverse().map((a) => (
                    <tr key={a.ano}>
                      <td className="py-1.5 font-semibold">{a.ano}</td>
                      <td className="py-1.5 text-right tabular-nums" style={{ color: a.resultado < 0 ? VERMELHO : undefined }}>{fmtBRL(a.resultado)}</td>
                      <td className="py-1.5 text-right tabular-nums">{fmtBRL(a.compensado)}</td>
                      <td className="py-1.5 text-right tabular-nums">{fmtNum(a.aliquota, 0, 2)}%</td>
                      <td className="py-1.5 text-right tabular-nums font-semibold">{fmtBRL(a.imposto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Lei 14.754/2023: o imposto é apurado no ano e pago na declaração de ajuste anual. A compra é convertida pela PTAX de compra do dia da compra
              e a venda pela PTAX de venda do dia da venda; spread e IOF de câmbio não são abatidos. Confirme essa regra de conversão com seu contador.
            </p>
          </div>
        )}

        {fonte.length > 0 && (
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground">Renda fixa (imposto retido na fonte, sem DARF)</h3>
            <ul className="text-sm text-muted-foreground space-y-0.5">
              {[...fonte].reverse().slice(0, 12).map((f) => (
                <li key={f.competencia}>{mesAno(f.competencia)}: ganho <span className="tabular-nums">{fmtBRL(f.ganho)}</span>, IR <span className="tabular-nums">{fmtBRL(f.ir)}</span></li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

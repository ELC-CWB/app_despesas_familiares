"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fmtBRL, fmtNum } from "@/lib/carteira/numeros";
import { NOME_CATEGORIA, situacaoDarf } from "@/lib/carteira/ir";
import { CODIGO_VENDA_ACOES_ISENTA, relatorioParaCsv, type RelatorioAnual } from "@/lib/carteira/ir-relatorio";
import { ACCENT } from "@/components/carteira/campos";

// Relatório anual para a declaração (REGRAS §7, parte 2). Estimativa: não substitui o contador.

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mes = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;
const data = (iso: string) => iso.split("-").reverse().join("/");
const AMBAR = "#8A5A00";
const VERMELHO = "#B42318";

function Secao({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2">
      <h2 className="text-base font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>{titulo}</h2>
      {nota && <p className="text-xs text-muted-foreground leading-snug">{nota}</p>}
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

const th = "py-1 px-2 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold border-b border-border";
const td = "py-1.5 px-2 text-[13px] border-b border-border/60 tabular-nums";

export function RelatorioIrView({
  relatorio: r, anos, anoAtual, semMovimentacoes, pagos, hoje, podeEditar,
}: { relatorio: RelatorioAnual; anos: number[]; anoAtual: number; semMovimentacoes: boolean; pagos: string[]; hoje: string; podeEditar: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [salvando, setSalvando] = useState<string | null>(null);
  const setPagos = new Set(pagos);

  // Marca (ou desmarca) o DARF de um mês como pago
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
  const baixar = () => {
    const blob = new Blob([relatorioParaCsv(r)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-ir-${r.ano}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const vazio = !r.bens.length && !r.proventos.length && !r.vendas.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground mr-1">Ano-calendário</span>
          {anos.map((a) => (
            <Link key={a} href={`/investments/ir?ano=${a}`} aria-current={a === r.ano ? "page" : undefined}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold border"
              style={a === r.ano ? { backgroundColor: ACCENT, borderColor: ACCENT, color: "#fff" } : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
              {a}{a === anoAtual ? " (em andamento)" : ""}
            </Link>
          ))}
        </div>
        <button type="button" onClick={baixar} disabled={vazio}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-secondary/50 flex items-center gap-1.5 disabled:opacity-50">
          <Download className="h-3.5 w-3.5" />Baixar CSV
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Estimativa calculada das suas movimentações, para você conferir e levar ao contador. Não substitui a orientação de um profissional.
        Os códigos de grupo e de ficha vêm de guias de bancos e corretoras (não do manual da Receita): os marcados com “conferir” têm fontes que divergem.
      </p>

      {semMovimentacoes && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ color: AMBAR, backgroundColor: "rgba(138,90,0,0.10)" }}>
          Ainda não há movimentações registradas. O relatório é montado a partir de Movimentações.
        </div>
      )}
      {r.avisos.length > 0 && (
        <div className="rounded-lg px-3 py-2 text-xs space-y-0.5" style={{ color: AMBAR, backgroundColor: "rgba(138,90,0,0.10)" }}>
          {r.avisos.map((a, i) => <p key={i}>{a}</p>)}
        </div>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["Resultado na B3", fmtBRL(r.totais.resultadoB3), `imposto estimado ${fmtBRL(r.totais.impostoB3)}`],
          ["Resultado no exterior", fmtBRL(r.totais.resultadoExterior), `imposto estimado ${fmtBRL(r.totais.impostoExterior)}`],
          ["Proventos recebidos", fmtBRL(r.totaisProventos.dividendos + r.totaisProventos.jcp + r.totaisProventos.rendimentos + r.totaisProventos.exterior), "dividendos, JCP e rendimentos"],
          ["IR retido na fonte", fmtBRL(r.totais.irRetidoFonte + r.totaisProventos.jcpIrRetido), "renda fixa e JCP"],
        ].map(([rotulo, valor, sub]) => (
          <div key={rotulo} className="rounded-2xl border border-border bg-card px-3 py-2.5 shadow-sm">
            <p className="text-[11px] text-muted-foreground font-medium leading-tight">{rotulo}</p>
            <p className="text-base font-bold text-foreground tabular-nums mt-0.5 leading-tight">{valor}</p>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      <Secao titulo={`Bens e direitos em 31/12/${r.ano}`}
        nota={`Posição e custo de aquisição de cada ativo no fim do ano e do ano anterior. A "discriminação" é um texto sugerido para o campo da declaração. Os códigos vêm de guias de bancos e corretoras, não do manual da Receita: confira no programa do IRPF.`}>
        {r.bens.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma posição em carteira nesse período.</p> : (
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="text-left">
                <th className={th}>Ativo</th><th className={`${th} text-right`}>31/12/{r.ano - 1}</th>
                <th className={`${th} text-right`}>31/12/{r.ano}</th><th className={`${th} text-right`}>Custo em 31/12/{r.ano}</th><th className={th}>Sede · gestora</th><th className={th}>Onde declarar</th>
              </tr>
            </thead>
            <tbody>
              {r.bens.map((b) => (
                <tr key={b.ativo_id} className="align-top">
                  <td className={`${td} font-bold`}>{b.codigo}
                    <span className="block text-[11px] font-normal text-muted-foreground">{b.mercado === "exterior" ? "Exterior" : "Brasil"}</span>
                  </td>
                  <td className={`${td} text-right`}>{fmtNum(b.quantidadeAnterior, 0, 8)} cotas<span className="block text-[11px] text-muted-foreground">{fmtBRL(b.custoAnterior)}</span></td>
                  <td className={`${td} text-right`}>{fmtNum(b.quantidade, 0, 8)} cotas</td>
                  <td className={`${td} text-right font-semibold`}>{fmtBRL(b.custo)}
                    {b.mercado === "exterior" && <span className="block text-[11px] font-normal text-muted-foreground">{b.moeda} {fmtNum(b.custoMoeda, 2, 2)}</span>}
                  </td>
                  <td className={`${td} text-muted-foreground`}>{[b.sede, b.gestora].filter(Boolean).join(" · ") || "—"}</td>
                  <td className={td}>
                    {b.declarar ? (
                      <>
                        <span className="font-semibold">Grupo · código {b.declarar.codigo}</span>
                        <span className="block text-[11px] text-muted-foreground leading-snug">{b.declarar.descricao}</span>
                        {b.declarar.divergente && <span className="block text-[11px] font-semibold" style={{ color: AMBAR }}>conferir: {b.declarar.nota ?? "as fontes divergem"}</span>}
                      </>
                    ) : <span className="text-[11px] text-muted-foreground">confirme no programa do IRPF</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {r.bens.length > 0 && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer font-semibold text-muted-foreground">Textos sugeridos para a discriminação</summary>
            <ul className="mt-1 space-y-1 text-muted-foreground">
              {r.bens.map((b) => <li key={b.ativo_id}><strong className="text-foreground">{b.codigo}:</strong> {b.discriminacao}</li>)}
            </ul>
          </details>
        )}
      </Secao>

      <Secao titulo="Proventos recebidos"
        nota="Dividendos e rendimentos de FII costumam ser isentos; o JCP tem IR retido na fonte. Os do exterior seguem a apuração anual.">
        {r.proventos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum provento registrado no ano.</p> : (
          <table className="w-full min-w-[620px]">
            <thead><tr className="text-left"><th className={th}>Ativo</th><th className={th}>Tipo</th><th className={`${th} text-right`}>Bruto</th><th className={`${th} text-right`}>IR retido</th><th className={`${th} text-right`}>Líquido</th><th className={th}>Onde declarar</th></tr></thead>
            <tbody>
              {r.proventos.map((l) => (
                <tr key={`${l.ativo_id}-${l.tipo}`}>
                  <td className={`${td} font-bold`}>{l.codigo}{l.exterior && <span className="font-normal text-muted-foreground"> · exterior</span>}</td>
                  <td className={td}>{l.tipo === "jcp" ? "JCP" : l.tipo === "dividendo" ? "Dividendo" : "Rendimento"}</td>
                  <td className={`${td} text-right`}>{fmtBRL(l.bruto)}</td>
                  <td className={`${td} text-right`}>{fmtBRL(l.irRetido)}</td>
                  <td className={`${td} text-right font-semibold`}>{fmtBRL(l.liquido)}</td>
                  <td className={td}>
                    <span className="font-semibold">{l.declarar.codigo !== "—" ? `Código ${l.declarar.codigo}` : l.declarar.ficha}</span>
                    <span className="block text-[11px] text-muted-foreground leading-snug">{l.declarar.codigo !== "—" ? `${l.declarar.ficha}: ${l.declarar.descricao}` : l.declarar.descricao}</span>
                    {l.declarar.divergente && <span className="block text-[11px] font-semibold" style={{ color: AMBAR }}>conferir: {l.declarar.nota}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Secao>

      <Secao titulo="Renda variável na B3" nota="Resultado e imposto por mês (DARF 6015). Ações: vendas de até R$ 20 mil no mês, com lucro, são isentas.">
        {r.mesesB3.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma venda na B3 no ano.</p> : (
          <table className="w-full min-w-[640px]">
            <thead><tr className="text-left"><th className={th}>Mês</th><th className={`${th} text-right`}>Resultado</th><th className={`${th} text-right`}>Imposto</th><th className={`${th} text-right`}>DARF</th><th className={th}>Vencimento</th><th className={th}>Situação</th></tr></thead>
            <tbody>
              {r.mesesB3.map((m) => {
                const resultado = m.categorias.reduce((s, c) => s + c.resultado, 0);
                return (
                  <tr key={m.competencia}>
                    <td className={`${td} font-semibold`}>{mes(m.competencia)}
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        {m.categorias.map((c) => `${NOME_CATEGORIA[c.categoria]}${c.isento ? ` (isento: Rendimentos Isentos, código ${CODIGO_VENDA_ACOES_ISENTA.codigo})` : ""}`).join(" · ")}
                      </span>
                    </td>
                    <td className={`${td} text-right`} style={{ color: resultado < 0 ? VERMELHO : undefined }}>{fmtBRL(resultado)}</td>
                    <td className={`${td} text-right`}>{fmtBRL(m.imposto)}</td>
                    <td className={`${td} text-right font-semibold`}>{m.darf > 0 ? fmtBRL(m.darf) : m.abaixoMinimo ? "abaixo de R$ 10" : "—"}</td>
                    <td className={td}>{m.darf > 0 ? data(m.vencimento) : "—"}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      {(() => {
                        const sit = situacaoDarf(m, setPagos, hoje);
                        if (sit === "sem_imposto") return <span className="text-muted-foreground">{m.abaixoMinimo ? "acumula" : "sem DARF"}</span>;
                        return (
                          <span className="inline-flex items-center gap-2">
                            <span className="font-semibold" style={{ color: sit === "pago" ? "#2E6B3F" : sit === "vencido" ? VERMELHO : AMBAR }}>
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
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Secao>

      {r.prejuizos.length > 0 && (
        <Secao titulo="Prejuízo a compensar" nota="Saldo no fim do ano. O prejuízo só compensa ganhos futuros da mesma categoria.">
          <ul className="text-sm text-muted-foreground space-y-0.5">
            {r.prejuizos.map((p) => <li key={p.rotulo}>{p.rotulo}: <strong className="text-foreground tabular-nums">{fmtBRL(p.valor)}</strong></li>)}
          </ul>
        </Secao>
      )}

      <Secao titulo="Exterior (Lei 14.754/2023)"
        nota="Apuração anual, paga na declaração: 15% sobre o resultado em reais. Compra convertida pela PTAX de compra do dia da compra e venda pela PTAX de venda do dia da venda (a confirmar com seu contador).">
        {!r.exterior ? <p className="text-sm text-muted-foreground">Nenhuma venda de ativo do exterior no ano.</p> : (
          <table className="w-full min-w-[420px]">
            <thead><tr className="text-left"><th className={`${th} text-right`}>Resultado</th><th className={`${th} text-right`}>Prejuízo compensado</th><th className={`${th} text-right`}>Base</th><th className={`${th} text-right`}>Alíquota</th><th className={`${th} text-right`}>Imposto</th><th className={`${th} text-right`}>Prejuízo a compensar</th></tr></thead>
            <tbody>
              <tr>
                <td className={`${td} text-right`} style={{ color: r.exterior.resultado < 0 ? VERMELHO : undefined }}>{fmtBRL(r.exterior.resultado)}</td>
                <td className={`${td} text-right`}>{fmtBRL(r.exterior.compensado)}</td>
                <td className={`${td} text-right`}>{fmtBRL(r.exterior.base)}</td>
                <td className={`${td} text-right`}>{fmtNum(r.exterior.aliquota, 0, 2)}%</td>
                <td className={`${td} text-right font-semibold`}>{fmtBRL(r.exterior.imposto)}</td>
                <td className={`${td} text-right`}>{fmtBRL(r.exterior.prejuizoFinal)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </Secao>

      <Secao titulo="Renda fixa (imposto retido na fonte)">
        {r.fonte.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum resgate de renda fixa no ano.</p> : (
          <table className="w-full min-w-[320px]">
            <thead><tr className="text-left"><th className={th}>Mês</th><th className={`${th} text-right`}>Ganho</th><th className={`${th} text-right`}>IR</th></tr></thead>
            <tbody>
              {r.fonte.map((m) => (
                <tr key={m.competencia}><td className={`${td} font-semibold`}>{mes(m.competencia)}</td><td className={`${td} text-right`}>{fmtBRL(m.ganho)}</td><td className={`${td} text-right`}>{fmtBRL(m.ir)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Secao>

      <Secao titulo="Vendas do ano" nota="Detalhe de cada venda: valor, receita líquida das taxas, custo de aquisição (preço médio) e resultado.">
        {r.vendas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma venda no ano.</p> : (
          <table className="w-full min-w-[620px]">
            <thead><tr className="text-left"><th className={th}>Data</th><th className={th}>Ativo</th><th className={th}>Categoria</th><th className={`${th} text-right`}>Venda</th><th className={`${th} text-right`}>Custo</th><th className={`${th} text-right`}>Resultado</th></tr></thead>
            <tbody>
              {r.vendas.map((v) => (
                <tr key={v.mov_id}>
                  <td className={td}>{data(v.data)}</td><td className={`${td} font-bold`}>{v.codigo}</td><td className={td}>{NOME_CATEGORIA[v.categoria]}</td>
                  <td className={`${td} text-right`}>{fmtBRL(v.bruto)}</td><td className={`${td} text-right`}>{fmtBRL(v.custo)}</td>
                  <td className={`${td} text-right font-semibold`} style={{ color: v.ganho < 0 ? VERMELHO : undefined }}>{fmtBRL(v.ganho)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Secao>
    </div>
  );
}

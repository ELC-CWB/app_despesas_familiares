import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronDown, PieChart } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { CotacaoDolar } from "@/components/carteira/cotacao-dolar";
import { BotaoAtualizar } from "@/components/carteira/botao-atualizar";
import { AlocacaoView, type AcaoVisaoGeral } from "@/components/carteira/alocacao-view";
import { IniciarUsufruto, UsufrutoCard } from "@/components/carteira/usufruto-card";
import { GraficosHistorico } from "@/components/carteira/graficos-historico";
import { carregarUsufruto } from "@/lib/carteira/usufruto-dados";
import { carregarIR } from "@/lib/carteira/ir-dados";
import { darfsPendentes } from "@/lib/carteira/ir";
import { getCarteira, temEstrutura } from "@/lib/carteira/dados";
import { hojeSP, lerCotacoes, lerMovimentacoes } from "@/lib/carteira/mercado";
import { avaliarCarteira, investidoLiquido, quantidadesPorAtivo, tickersNecessarios, type Cotacao } from "@/lib/carteira/patrimonio";
import { montarAlocacao, resumoStatus } from "@/lib/carteira/alocacao";
import { sugestaoAporte } from "@/lib/carteira/operacoes";
import { fmtBRL, fmtNum } from "@/lib/carteira/numeros";
import { alvosFecham100, somaAlvos } from "@/lib/carteira/regras";

const ACCENT = "#3b82f6";
const VERMELHO = "#B42318";

const fmtData = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };

// Visão geral da Carteira (docs/carteira/SPEC.md §4.2). Abre sempre, mesmo sem dados.
// Faixa de status, patrimônio, gráfico de rosca em 3 anéis, Real x planejado e sugestão de aporte.
// Sede informada no ativo; sem ela, ativo negociado no Brasil mostra Brasil
const sedeDoAtivo = (a?: { sede: string | null; mercado: string }) => a?.sede ?? (a?.mercado === "brasil" ? "Brasil" : "—");

export default async function InvestmentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, carteira] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    getCarteira(supabase, user.id),
  ]);

  const { ativos, blocos, geografias } = carteira.estrutura;
  const vazia = !temEstrutura(carteira);
  const soma = somaAlvos(ativos);

  const [cotacoes, movs] = await Promise.all([
    // Sem a tabela de mercado (migration da Fase 2 pendente), a tela abre sem cotações
    lerCotacoes(supabase, tickersNecessarios(ativos)).catch((): Record<string, Cotacao> => ({})),
    lerMovimentacoes(supabase, carteira.targetProfileId),
  ]);
  const { total, itens } = avaliarCarteira(ativos, quantidadesPorAtivo(movs), cotacoes);
  const investido = investidoLiquido(movs);
  const comPosicao = itens.filter((i) => i.quantidade !== 0);
  const semCotacao = comPosicao.filter((i) => i.aviso && i.valor === 0);

  const valores = Object.fromEntries(itens.map((i) => [i.ativo_id, i.valor]));
  const alocacao = montarAlocacao(geografias, blocos, ativos, valores);
  const status = resumoStatus(alocacao);
  const sugestao = sugestaoAporte(ativos, valores);

  // "Preços de fechamento de dd/mm/aaaa" ou "Cotações de hoje às HH:MM (atraso de até 15 min)"
  // Com posições, vale a cotação delas; sem nenhuma (carteira nova), a de todos os ativos cadastrados
  const tickersDaLegenda = (comPosicao.length ? comPosicao.map((i) => ativos.find((a) => a.id === i.ativo_id)) : ativos).map((a) => a?.ticker_cotacao);
  const usadas = tickersDaLegenda.map((t) => (t ? cotacoes[t] : undefined)).filter((c) => !!c);
  const intradiaria = usadas.find((c) => c.intradiaria);
  const dataPrecos = usadas.map((c) => c.data).sort().at(-1);
  const legendaPrecos = intradiaria
    ? `Cotações de hoje às ${new Date(intradiaria.atualizado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })} (atraso de até 15 min)`
    : dataPrecos ? `Preços de fechamento de ${fmtData(dataPrecos)}` : "Sem cotações salvas ainda";

  // Cartão de ação conforme a fase (SPEC §4.2): só dados, a tela desenha o cartão
  // Aviso de DARF (REGRAS §7): vencido ou vencendo em até 10 dias e ainda não marcado como pago
  const ir = await carregarIR(supabase, carteira).catch(() => null);
  const darfs = ir ? darfsPendentes(ir.meses, new Set(ir.pagos), hojeSP()) : [];
  const usufruto = carteira.config?.fase === "usufruto";
  const estadoUsufruto = usufruto ? (await carregarUsufruto(supabase, carteira, { total, valores })).estado : null;
  const acao: AcaoVisaoGeral | undefined = !usufruto && sugestao && !alocacao.semPosicoes
    ? { tipo: "aporte", codigo: sugestao.ativo.codigo, falta: sugestao.falta, podeRegistrar: !carteira.isReadOnly }
    : undefined;

  return (
    <div>
      <Header title="Visão geral" subtitle={carteira.config?.nome || "Carteira de investimentos"} profile={profile} acessorio={<CotacaoDolar />} />
      <div className="px-5 pt-3 pb-5 lg:px-8 lg:pt-4 lg:pb-8 space-y-3">
        {vazia ? (
          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm flex flex-col items-center gap-3 text-center max-w-xl mx-auto">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(59,130,246,0.1)" }}>
              <PieChart className="h-6 w-6" style={{ color: ACCENT }} />
            </div>
            <p className="text-base font-bold text-foreground">Nenhuma estratégia cadastrada</p>
            <p className="text-sm text-muted-foreground">
              {carteira.isReadOnly
                ? `${carteira.ownerName ?? "O administrador do grupo"} ainda não montou a estratégia da carteira.`
                : "Monte a estratégia passo a passo ou cadastre cada parte direto em Configurações."}
            </p>
            {!carteira.isReadOnly && (
              <div className="flex flex-wrap justify-center gap-2 mt-1">
                <Link href="/investments/primeiros-passos"
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: ACCENT }}>
                  Primeiros passos
                </Link>
                <Link href="/investments/settings/carteira"
                  className="px-4 py-2 rounded-lg text-sm font-semibold border border-border hover:bg-secondary/50 transition-colors">
                  Ir para Configurações
                </Link>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Faixa de status */}
            <div className="rounded-lg px-3 py-1.5"
              style={status.fora
                ? { backgroundColor: "rgba(180,35,24,0.10)", color: VERMELHO }
                : { backgroundColor: "rgba(31,50,71,0.08)", color: "hsl(var(--foreground))" }}>
              <p className="text-xs truncate" title={`${status.titulo} · ${status.detalhe}`}>
                <strong>{status.titulo}</strong>
                <span style={status.fora ? undefined : { color: "hsl(var(--muted-foreground))" }}> · {status.detalhe}</span>
              </p>
            </div>

            {ativos.length > 0 && !alvosFecham100(soma) && (
              <div className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ color: VERMELHO, backgroundColor: "rgba(180,35,24,0.08)" }}>
                A soma dos alvos está em {fmtNum(soma, 1, 2)}%: a estratégia só fecha com 100%.{" "}
                <Link href="/investments/settings/carteira" className="underline">Ajustar em Configurações</Link>
              </div>
            )}

            {semCotacao.length > 0 && (
              <div className="rounded-lg px-3 py-1.5 text-xs" style={{ color: "#8A5A00", backgroundColor: "rgba(138,90,0,0.10)" }}>
                <strong>Sem cotação para {semCotacao.map((i) => i.codigo).join(", ")}.</strong>{" "}
                O patrimônio e os percentuais abaixo não incluem {semCotacao.length === 1 ? "esse ativo" : "esses ativos"}.
              </div>
            )}

            {darfs.length > 0 && (
              <div className="rounded-lg px-3 py-1.5 text-xs" style={{ color: "#8A5A00", backgroundColor: "rgba(138,90,0,0.10)" }}>
                <strong>DARF de imposto de renda: </strong>
                {darfs.map((d) => `${fmtBRL(d.darf)} de ${d.competencia.slice(5, 7)}/${d.competencia.slice(0, 4)} (${d.vencimento < hojeSP() ? "venceu" : "vence"} em ${d.vencimento.split("-").reverse().join("/")})`).join("; ")}.{" "}
                <Link href="/investments/ir" className="underline">Ver em Imposto de renda</Link>
              </div>
            )}

            {/* Patrimônio, investido líquido e ganho: três colunas iguais; Atualizar e a data das cotações à direita */}
            <div className="rounded-2xl border border-border bg-card px-4 py-2.5 shadow-sm">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-2 flex-1 min-w-[260px] sm:text-center">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground leading-tight">Patrimônio total</p>
                    <p className="text-xl sm:text-2xl font-bold text-foreground tabular-nums leading-tight" style={{ fontFamily: "Sora, sans-serif" }}>
                      {fmtBRL(total)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground leading-tight">Investido líquido</p>
                    <p className="text-base sm:text-lg font-bold text-foreground tabular-nums leading-tight" style={{ fontFamily: "Sora, sans-serif" }}>
                      {fmtBRL(investido)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground leading-tight">Ganho</p>
                    <p className="text-base sm:text-lg font-bold tabular-nums leading-tight" style={{ fontFamily: "Sora, sans-serif", color: total - investido >= 0 ? "#2E6B3F" : VERMELHO }}>
                      {fmtBRL(total - investido)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <BotaoAtualizar />
                  <p className="text-[11px] text-muted-foreground text-right leading-tight sm:whitespace-nowrap">{legendaPrecos}</p>
                </div>
              </div>
            </div>

            {estadoUsufruto && <UsufrutoCard estado={estadoUsufruto} podeEditar={!carteira.isReadOnly} />}

            <AlocacaoView nos={alocacao.nos} semPosicoes={alocacao.semPosicoes} acao={acao} />

            {!usufruto && !carteira.isReadOnly && !alocacao.semPosicoes && (
              <IniciarUsufruto hoje={hojeSP()} patrimonio={total} retiradaPct={carteira.plano?.retirada_pct ?? null} />
            )}

            {comPosicao.length > 0 && (
              <details className="group rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                <summary className="px-4 py-3 cursor-pointer flex items-center justify-between gap-2 list-none [&::-webkit-details-marker]:hidden hover:bg-secondary/30 transition-colors">
                  <span className="flex items-center gap-2">
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform -rotate-90 group-open:rotate-0" aria-hidden />
                    <span className="text-base font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>Posições</span>
                  </span>
                  <span className="text-xs text-muted-foreground">cotas e cotações · {ativos.length} ativos em {blocos.length} blocos</span>
                </summary>
                <div className="overflow-x-auto border-t border-border">
                  <table className="w-full text-[13px] leading-snug">
                    <thead className="bg-secondary/30">
                      <tr className="border-b border-border text-left text-xs font-bold text-muted-foreground">
                        <th className="px-4 py-1">Ativo</th>
                        <th className="px-4 py-1">Sede</th>
                        <th className="px-4 py-1">Gestora</th>
                        <th className="px-4 py-1 text-right">Cotas</th>
                        <th className="px-4 py-1 text-right">Cotação</th>
                        <th className="px-4 py-1 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {comPosicao.map((i) => (
                        <tr key={i.ativo_id}>
                          <td className="px-4 py-1">
                            <span className="font-bold text-foreground">{i.codigo}</span>
                            {i.aviso && <span className="block text-[11px] font-medium" style={{ color: VERMELHO }}>{i.aviso}</span>}
                          </td>
                          <td className="px-4 py-1 whitespace-nowrap text-muted-foreground">{sedeDoAtivo(ativos.find((a) => a.id === i.ativo_id))}</td>
                          <td className="px-4 py-1 whitespace-nowrap text-muted-foreground">{ativos.find((a) => a.id === i.ativo_id)?.gestora ?? "—"}</td>
                          <td className="px-4 py-1 text-right tabular-nums">{fmtNum(i.quantidade, 0, 8)}</td>
                          <td className="px-4 py-1 text-right tabular-nums whitespace-nowrap">
                            {i.preco != null ? `${i.moedaPreco === "BRL" ? "R$" : i.moedaPreco} ${fmtNum(i.preco, 2, 4)}` : "—"}
                          </td>
                          <td className="px-4 py-1 text-right font-semibold tabular-nums whitespace-nowrap">{fmtBRL(i.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            {comPosicao.length > 0 && <GraficosHistorico />}
          </>
        )}
      </div>
    </div>
  );
}

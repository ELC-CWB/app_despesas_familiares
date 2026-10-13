import Link from "next/link";
import { redirect } from "next/navigation";
import { PieChart } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { CotacaoDolar } from "@/components/carteira/cotacao-dolar";
import { BotaoAtualizar } from "@/components/carteira/botao-atualizar";
import { getCarteira, temEstrutura } from "@/lib/carteira/dados";
import { lerCotacoes, lerMovimentacoes } from "@/lib/carteira/mercado";
import { avaliarCarteira, investidoLiquido, quantidadesPorAtivo, tickersNecessarios, type Cotacao } from "@/lib/carteira/patrimonio";
import { fmtBRL, fmtNum } from "@/lib/carteira/numeros";
import { alvosFecham100, somaAlvos } from "@/lib/carteira/regras";

const ACCENT = "#3b82f6";
const VERMELHO = "#B42318";

const fmtData = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };

// Visão geral da Carteira (docs/carteira/SPEC.md §4.2). Abre sempre, mesmo sem dados.
// Fase 2: patrimônio, data das cotações e botão Atualizar. Gráfico e Real x planejado: Fase 4.
export default async function InvestmentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, carteira] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    getCarteira(supabase, user.id),
  ]);

  const { ativos, blocos } = carteira.estrutura;
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

  // "Preços de fechamento de dd/mm/aaaa" ou "Cotações de hoje às HH:MM (atraso de até 15 min)"
  const usadas = comPosicao.map((i) => ativos.find((a) => a.id === i.ativo_id)?.ticker_cotacao)
    .map((t) => (t ? cotacoes[t] : undefined)).filter((c) => !!c);
  const intradiaria = usadas.find((c) => c.intradiaria);
  const dataPrecos = usadas.map((c) => c.data).sort().at(-1);
  const legendaPrecos = intradiaria
    ? `Cotações de hoje às ${new Date(intradiaria.atualizado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })} (atraso de até 15 min)`
    : dataPrecos ? `Preços de fechamento de ${fmtData(dataPrecos)}` : "Sem cotações salvas ainda";

  return (
    <div>
      <Header title="Visão geral" subtitle="Carteira de investimentos" profile={profile} acessorio={<CotacaoDolar />} />
      <div className="p-5 lg:p-8 space-y-4">
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
            {ativos.length > 0 && !alvosFecham100(soma) && (
              <div className="rounded-xl px-4 py-3 text-sm font-semibold" style={{ color: VERMELHO, backgroundColor: "rgba(180,35,24,0.08)" }}>
                A soma dos alvos está em {fmtNum(soma, 1, 2)}%: a estratégia só fecha com 100%.{" "}
                <Link href="/investments/settings/carteira" className="underline">Ajustar em Configurações</Link>
              </div>
            )}

            <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Patrimônio total</p>
                  <p className="text-2xl sm:text-3xl font-bold text-foreground tabular-nums" style={{ fontFamily: "Sora, sans-serif" }}>
                    {fmtBRL(total)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{legendaPrecos}</p>
                </div>
                <BotaoAtualizar />
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border">
                <div>
                  <p className="text-xs text-muted-foreground">Investido líquido</p>
                  <p className="text-sm font-bold text-foreground tabular-nums">{fmtBRL(investido)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ganho</p>
                  <p className="text-sm font-bold tabular-nums" style={{ color: total - investido >= 0 ? "#2E6B3F" : VERMELHO }}>
                    {fmtBRL(total - investido)}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-baseline justify-between gap-2">
                <h2 className="text-base font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>Posições</h2>
                <span className="text-xs text-muted-foreground">{ativos.length} ativos em {blocos.length} blocos</span>
              </div>
              {comPosicao.length === 0 ? (
                <p className="text-sm text-muted-foreground px-4 py-6 text-center">
                  Nenhuma posição ainda. As compras registradas em Movimentações aparecem aqui.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/30">
                      <tr className="border-b border-border text-left text-xs font-bold text-muted-foreground">
                        <th className="px-4 py-2.5">Ativo</th>
                        <th className="px-4 py-2.5 text-right hidden sm:table-cell">Cotas</th>
                        <th className="px-4 py-2.5 text-right hidden sm:table-cell">Cotação</th>
                        <th className="px-4 py-2.5 text-right">Valor</th>
                        <th className="px-4 py-2.5 text-right">Real</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {comPosicao.map((i) => (
                        <tr key={i.ativo_id}>
                          <td className="px-4 py-2.5">
                            <span className="font-bold text-foreground">{i.codigo}</span>
                            {i.aviso && <span className="block text-[11px] font-medium" style={{ color: VERMELHO }}>{i.aviso}</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right hidden sm:table-cell tabular-nums">{fmtNum(i.quantidade, 0, 8)}</td>
                          <td className="px-4 py-2.5 text-right hidden sm:table-cell tabular-nums whitespace-nowrap">
                            {i.preco != null ? `${i.moedaPreco === "BRL" ? "R$" : i.moedaPreco} ${fmtNum(i.preco, 2, 4)}` : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap">{fmtBRL(i.valor)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{total > 0 ? `${fmtNum((i.valor / total) * 100, 1, 1)}%` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground px-4 py-2 border-t border-border">
                O gráfico da carteira e a comparação com os alvos (Real x planejado) chegam em breve nesta tela.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

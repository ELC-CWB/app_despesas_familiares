import { redirect } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { CotacaoDolar } from "@/components/carteira/cotacao-dolar";
import { getCarteira } from "@/lib/carteira/dados";
import { fmtBRL, fmtNum } from "@/lib/carteira/numeros";

const ACCENT = "#3b82f6";
const OPERACAO: Record<string, string> = { compra: "Compra", venda: "Venda", provento: "Provento" };

type Linha = {
  id: string; data: string; tipo: string; quantidade: number | null; preco_unit: number | null; moeda: string;
  valor_liquido_brl: number; spread_valor: number; iof_valor: number; corretagem: number; emolumentos: number;
  outras_taxas: number; ativo_id: string; corretora_id: string | null;
};

const fmtData = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };

// Movimentações (docs/carteira/SPEC.md §4.4). Por enquanto mostra o histórico registrado;
// o registro de compra, venda e provento com custos chega na Fase 3 (PLANO.md).
export default async function MovimentacoesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, carteira] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    getCarteira(supabase, user.id),
  ]);

  const { data, error } = await supabase
    .from("carteira_movimentacoes")
    .select("id, data, tipo, quantidade, preco_unit, moeda, valor_liquido_brl, spread_valor, iof_valor, corretagem, emolumentos, outras_taxas, ativo_id, corretora_id")
    .eq("profile_id", carteira.targetProfileId)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const linhas = (data ?? []) as Linha[];
  const codigo = Object.fromEntries(carteira.estrutura.ativos.map((a) => [a.id, a.codigo]));
  const corretora = Object.fromEntries(carteira.estrutura.corretoras.map((c) => [c.id, c.nome]));
  const soma = (tipo: string) => linhas.filter((l) => l.tipo === tipo).reduce((s, l) => s + Number(l.valor_liquido_brl), 0);
  const compras = soma("compra"), vendas = soma("venda"), proventos = soma("provento");

  return (
    <div>
      <Header title="Movimentações" subtitle="Compras, vendas e proventos" profile={profile} acessorio={<CotacaoDolar />} />
      <div className="p-5 lg:p-8 space-y-4">
        <div className="rounded-xl px-4 py-3 text-sm border"
          style={{ borderColor: `${ACCENT}4d`, backgroundColor: `${ACCENT}0d`, color: ACCENT }}>
          O registro de compras, vendas e proventos, com o cálculo de custos e impostos, chega em breve nesta tela.
        </div>

        {linhas.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(59,130,246,0.1)" }}>
              <ArrowLeftRight className="h-6 w-6" style={{ color: ACCENT }} />
            </div>
            <p className="text-base font-bold text-foreground">Nenhuma movimentação registrada</p>
            <p className="text-sm text-muted-foreground max-w-md">
              As posições informadas nos Primeiros passos aparecem aqui como compras iniciais.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="text-base font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>Histórico de movimentações</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/30">
                    <tr className="border-b border-border text-left text-xs font-bold text-muted-foreground">
                      <th className="px-4 py-2.5">Data</th>
                      <th className="px-4 py-2.5">Ativo</th>
                      <th className="px-4 py-2.5">Operação</th>
                      <th className="px-4 py-2.5 hidden md:table-cell">Corretora</th>
                      <th className="px-4 py-2.5 text-right hidden sm:table-cell">Taxas</th>
                      <th className="px-4 py-2.5 text-right hidden sm:table-cell">Valor da cota</th>
                      <th className="px-4 py-2.5 text-right hidden sm:table-cell">Cotas</th>
                      <th className="px-4 py-2.5 text-right">Valor líquido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {linhas.map((l) => {
                      const taxas = [l.spread_valor, l.iof_valor, l.corretagem, l.emolumentos, l.outras_taxas].reduce((s, v) => s + Number(v), 0);
                      return (
                        <tr key={l.id} className="hover:bg-secondary/30 transition-colors">
                          <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{fmtData(l.data)}</td>
                          <td className="px-4 py-2.5 font-bold text-foreground">{codigo[l.ativo_id] ?? "—"}</td>
                          <td className="px-4 py-2.5">{OPERACAO[l.tipo] ?? l.tipo}</td>
                          <td className="px-4 py-2.5 hidden md:table-cell text-muted-foreground">{l.corretora_id ? corretora[l.corretora_id] ?? "—" : "—"}</td>
                          <td className="px-4 py-2.5 text-right hidden sm:table-cell tabular-nums">{fmtBRL(taxas)}</td>
                          <td className="px-4 py-2.5 text-right hidden sm:table-cell tabular-nums whitespace-nowrap">
                            {l.preco_unit != null ? `${l.moeda === "BRL" ? "R$" : l.moeda} ${fmtNum(Number(l.preco_unit), 2, 6)}` : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right hidden sm:table-cell tabular-nums">{l.quantidade != null ? fmtNum(Number(l.quantidade), 0, 8) : "—"}</td>
                          <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmtBRL(Number(l.valor_liquido_brl))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {([
                ["Compras", compras],
                ["Vendas", vendas],
                ["Proventos (bruto)", proventos],
                ["Saldo investido", compras - vendas - proventos],
              ] as const).map(([k, v]) => (
                <div key={k} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground font-medium">{k}</p>
                  <p className="text-base font-bold text-foreground mt-1 tabular-nums">{fmtBRL(v)}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

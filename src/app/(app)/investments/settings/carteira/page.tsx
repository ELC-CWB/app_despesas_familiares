import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { CotacaoDolar } from "@/components/carteira/cotacao-dolar";
import { ConfiguracoesClient } from "@/components/carteira/configuracoes-client";
import { NomeCarteira } from "@/components/carteira/nome-carteira";
import { getCarteira, temEstrutura } from "@/lib/carteira/dados";
import { lerCotacoes, lerMovimentacoes } from "@/lib/carteira/mercado";
import { avaliarCarteira, quantidadesPorAtivo, tickersNecessarios, type Cotacao } from "@/lib/carteira/patrimonio";

// Configurações › Carteira (docs/carteira/SPEC.md §4.5): corretoras, geografias e blocos, ativos (com o IR de cada um).
export default async function ConfiguracoesCarteiraPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, carteira] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    getCarteira(supabase, user.id),
  ]);

  // Valor atual de cada ativo, para a cobertura do colchão de liquidez
  const [cotacoes, movs] = await Promise.all([
    lerCotacoes(supabase, tickersNecessarios(carteira.estrutura.ativos)).catch((): Record<string, Cotacao> => ({})),
    lerMovimentacoes(supabase, carteira.targetProfileId),
  ]);
  const { total, itens } = avaliarCarteira(carteira.estrutura.ativos, quantidadesPorAtivo(movs), cotacoes);
  const avaliacao = {
    patrimonio: total,
    valorPorAtivo: Object.fromEntries(itens.map((i) => [i.ativo_id, i.valor])),
    retiradaPct: carteira.plano?.retirada_pct ?? 3.5,
  };

  return (
    <div>
      <Header title="Carteira" subtitle="Corretoras, ativos, custos e IR usados nas estimativas de compras e vendas" profile={profile} acessorio={<CotacaoDolar />} />
      <div className="p-5 lg:p-8 space-y-4">
        <NomeCarteira nomeAtual={carteira.config?.nome ?? null} padrao="Carteira de investimentos" podeEditar={!carteira.isReadOnly} />
        {!carteira.isReadOnly && !temEstrutura(carteira) && (
          <p className="text-sm text-muted-foreground">
            Carteira vazia. Cadastre cada parte abaixo ou, se preferir, use os{" "}
            <Link href="/investments/primeiros-passos" className="font-semibold" style={{ color: "#3b82f6" }}>Primeiros passos</Link>.
          </p>
        )}
        <ConfiguracoesClient
          avaliacao={avaliacao}
          estruturaInicial={carteira.estrutura}
          isReadOnly={carteira.isReadOnly}
          ownerName={carteira.ownerName}
        />
      </div>
    </div>
  );
}

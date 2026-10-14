import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { CotacaoDolar } from "@/components/carteira/cotacao-dolar";
import { PlanoClient } from "@/components/carteira/plano-client";
import { getCarteira, getVersoesPlano } from "@/lib/carteira/dados";
import { hojeSP, lerCotacoes, lerIpca, lerMovimentacoes, lerSnapshots } from "@/lib/carteira/mercado";
import { avaliarCarteira, investidoLiquido, quantidadesPorAtivo, tickersNecessarios, type Cotacao } from "@/lib/carteira/patrimonio";

// Plano (docs/carteira/SPEC.md §4.3): premissas, túnel, perpetuidade, retiradas, evolução por ano,
// regras de ajuste da retirada e versões. O túnel é corrigido pelo IPCA (REGRAS §2).
export default async function PlanoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, carteira] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    getCarteira(supabase, user.id),
  ]);

  const alvo = carteira.targetProfileId;
  const ativos = carteira.estrutura.ativos;
  const hoje = hojeSP();
  const anoAtual = Number(hoje.slice(0, 4));
  const versoes = await getVersoesPlano(supabase, alvo).catch(() => []);
  // IPCA desde o início do plano mais antigo (ou 10 anos atrás); o campo "Início do plano" não vai além disso
  const anoMinimo = Math.min(anoAtual - 10, ...versoes.map((v) => v.ano_inicio));
  const [cotacoes, movs, snapshots, ipca] = await Promise.all([
    lerCotacoes(supabase, tickersNecessarios(ativos)).catch((): Record<string, Cotacao> => ({})),
    lerMovimentacoes(supabase, alvo),
    lerSnapshots(supabase, alvo),
    lerIpca(supabase, anoMinimo),
  ]);

  const { total } = avaliarCarteira(ativos, quantidadesPorAtivo(movs), cotacoes);
  const c = carteira.config;
  const regras = {
    regra_protecao_on: c?.regra_protecao_on ?? true, regra_queda_pct: c?.regra_queda_pct ?? 20, regra_corte_pct: c?.regra_corte_pct ?? 10,
    regra_aumento_on: c?.regra_aumento_on ?? true, regra_gatilho_pct: c?.regra_gatilho_pct ?? 3, regra_aumento_pct: c?.regra_aumento_pct ?? 10,
  };

  // Remonta a tela quando as versões mudam (salvar, trocar a versão em uso)
  const chave = versoes.map((v) => `${v.id}:${v.em_uso}:${v.atualizado_em}`).join("|") + `|${JSON.stringify(regras)}`;

  return (
    <div>
      <Header title="Plano" subtitle="Acumulação e usufruto da carteira" profile={profile} acessorio={<CotacaoDolar />} />
      <div className="px-5 pt-3 pb-8 lg:px-8 lg:pt-4">
        <PlanoClient
          key={chave}
          isReadOnly={carteira.isReadOnly}
          ownerName={carteira.ownerName}
          hoje={hoje}
          anoMinimo={anoMinimo}
          patrimonioHoje={total}
          investidoHoje={investidoLiquido(movs)}
          versoes={versoes}
          ipca={ipca.meses}
          ipcaFonte={ipca.fonte}
          snapshots={snapshots}
          regras={regras}
        />
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { CotacaoDolar } from "@/components/carteira/cotacao-dolar";
import { RelatorioIrView } from "@/components/carteira/ir-relatorio-view";
import { getCarteira } from "@/lib/carteira/dados";
import { ALIQUOTAS_PADRAO } from "@/lib/carteira/constantes";
import { lerDarfsPagos, lerMovimentacoesIR } from "@/lib/carteira/ir-dados";
import { anosComMovimentacao, montarRelatorioAnual } from "@/lib/carteira/ir-relatorio";
import { hojeSP } from "@/lib/carteira/mercado";

// Imposto de renda (docs/carteira/REGRAS.md §7, parte 2): relatório anual para a declaração.
// Aceita ?ano=AAAA; sem ele, mostra o ano anterior (o da declaração em curso) se houver movimentações.
export default async function ImpostoDeRendaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, carteira, qs] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    getCarteira(supabase, user.id),
    searchParams,
  ]);

  const hoje = hojeSP();
  const anoAtual = Number(hoje.slice(0, 4));
  const [movs, pagos] = await Promise.all([
    lerMovimentacoesIR(supabase, carteira.targetProfileId).catch(() => []),
    lerDarfsPagos(supabase, carteira.targetProfileId),
  ]);
  const anos = anosComMovimentacao(movs, anoAtual);
  const pedido = Number(qs.ano);
  const anoPadrao = anos.includes(anoAtual - 1) ? anoAtual - 1 : anos[0];
  const ano = anos.includes(pedido) ? pedido : anoPadrao;

  const relatorio = montarRelatorioAnual({
    ano,
    ativos: carteira.estrutura.ativos.map((a) => ({
      id: a.id, codigo: a.codigo, tipo: a.tipo, mercado: a.mercado, aliquota_ir_pct: a.aliquota_ir_pct,
      moeda: a.moeda, sede: a.sede, gestora: a.gestora,
    })),
    movs,
    aliquotasTipo: { ...ALIQUOTAS_PADRAO, ...carteira.config?.aliquotas },
  });

  return (
    <div>
      <Header title="Imposto de renda" subtitle="Relatório para a declaração (estimativa)" profile={profile} acessorio={<CotacaoDolar />} />
      <div className="px-5 pt-3 pb-8 lg:px-8 lg:pt-4">
        <RelatorioIrView relatorio={relatorio} anos={anos} anoAtual={anoAtual} semMovimentacoes={movs.length === 0}
          pagos={pagos} hoje={hoje} podeEditar={!carteira.isReadOnly} />
      </div>
    </div>
  );
}

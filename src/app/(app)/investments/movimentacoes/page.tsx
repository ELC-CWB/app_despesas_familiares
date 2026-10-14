import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { CotacaoDolar } from "@/components/carteira/cotacao-dolar";
import { MovimentacoesClient, type MovCompleta } from "@/components/carteira/movimentacoes-client";
import { getCarteira } from "@/lib/carteira/dados";
import { hojeSP, lerCotacoes } from "@/lib/carteira/mercado";
import { avaliarCarteira, cambiosDasCotacoes, quantidadesPorAtivo, tickersNecessarios, type Cotacao } from "@/lib/carteira/patrimonio";
import { ALIQUOTAS_PADRAO } from "@/lib/carteira/constantes";
import { tonsDosBlocos } from "@/lib/carteira/regras";

// Movimentações (docs/carteira/SPEC.md §4.4): Compra, Venda e Provento, efeito na carteira,
// custos de aquisição e histórico. Aceita ?op=compra&ativo=X ou ?op=venda&ativo=X&valor=Y.
export default async function MovimentacoesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, carteira, qs] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    getCarteira(supabase, user.id),
    searchParams,
  ]);
  const { ativos, corretoras, blocos, geografias } = carteira.estrutura;

  const [cotacoes, { data: movsData, error }] = await Promise.all([
    lerCotacoes(supabase, tickersNecessarios(ativos)).catch((): Record<string, Cotacao> => ({})),
    supabase
      .from("carteira_movimentacoes")
      .select("id, data, tipo, ativo_id, corretora_id, quantidade, preco_unit, moeda, valor_bruto, cambio_usado, ptax_venda, spread_valor, iof_valor, corretagem, emolumentos, outras_taxas, provento_tipo, ir_retido, ir_estimado, valor_liquido_brl, observacoes, created_at")
      .eq("profile_id", carteira.targetProfileId)
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })
      .range(0, 9999),
  ]);
  if (error) throw new Error(error.message);

  const num = (v: unknown) => (v == null ? null : Number(v));
  const movs: MovCompleta[] = (movsData ?? []).map((m) => ({
    id: m.id, data: m.data, tipo: m.tipo, ativo_id: m.ativo_id, corretora_id: m.corretora_id,
    quantidade: num(m.quantidade), preco_unit: num(m.preco_unit), moeda: m.moeda, valor_bruto: Number(m.valor_bruto),
    cambio_usado: num(m.cambio_usado), ptax_venda: num(m.ptax_venda),
    spread_valor: Number(m.spread_valor), iof_valor: Number(m.iof_valor), corretagem: Number(m.corretagem),
    emolumentos: Number(m.emolumentos), outras_taxas: Number(m.outras_taxas), provento_tipo: m.provento_tipo,
    ir_retido: Number(m.ir_retido), ir_estimado: num(m.ir_estimado), valor_liquido_brl: Number(m.valor_liquido_brl),
    observacoes: m.observacoes,
  }));

  const quantidades = quantidadesPorAtivo(movs);
  const { itens } = avaliarCarteira(ativos, quantidades, cotacoes);
  const cambios = cambiosDasCotacoes(cotacoes);
  const precos = Object.fromEntries(ativos.map((a) => {
    const c = a.ticker_cotacao ? cotacoes[a.ticker_cotacao] : undefined;
    return [a.id, c ? { preco: c.fechamento, moeda: c.moeda ?? a.moeda, data: c.data } : null];
  }));

  const ativoInicial = ativos.find((a) => a.codigo === (qs.ativo ?? "").toUpperCase());
  const op = qs.op === "venda" || qs.op === "provento" ? qs.op : "compra";

  return (
    <div>
      <Header title="Movimentações" subtitle="Compras, vendas e proventos" profile={profile} acessorio={<CotacaoDolar />} />
      <div className="p-5 lg:p-8">
        <MovimentacoesClient
          isReadOnly={carteira.isReadOnly}
          ownerName={carteira.ownerName}
          hoje={hojeSP()}
          ativos={ativos}
          blocos={blocos}
          corretoras={corretoras}
          tons={tonsDosBlocos(geografias, blocos)}
          valores={Object.fromEntries(itens.map((i) => [i.ativo_id, i.valor]))}
          quantidades={quantidades}
          precos={precos}
          cambios={cambios}
          aliquotas={{ ...ALIQUOTAS_PADRAO, ...carteira.config?.aliquotas }}
          movs={movs}
          inicial={{ op, ativoId: ativoInicial?.id ?? null, valor: qs.valor ? Number(qs.valor) : null }}
        />
      </div>
    </div>
  );
}

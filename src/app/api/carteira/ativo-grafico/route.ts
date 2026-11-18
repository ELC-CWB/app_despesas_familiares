import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasInvestmentsAccess } from "@/lib/investments-access";
import { getCarteira } from "@/lib/carteira/dados";
import { fetchYahooChart, type YahooChart } from "@/lib/market/yahoo";
import { PERIODOS_GRAFICO } from "@/lib/carteira/ativo-grafico";

// Histórico de preços do ativo para o popup do gráfico (Visão geral). Só consulta ativos cadastrados na
// carteira do usuário (o ticker nunca vem do cliente). Cache em memória do servidor para não repetir chamadas.
export const maxDuration = 20;

const TTL_MS = 60 * 60 * 1000;
const TTL_FALHA_MS = 5 * 60 * 1000;
const cache = new Map<string, { ate: number; chart: YahooChart | null }>();

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  if (!await hasInvestmentsAccess(supabase, user.id)) {
    return NextResponse.json({ error: "Sem acesso ao módulo de investimentos." }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const codigo = params.get("codigo")?.trim();
  const periodo = PERIODOS_GRAFICO.find((p) => p.id === params.get("periodo"));
  if (!codigo) return NextResponse.json({ error: "Informe o ativo." }, { status: 400 });
  if (!periodo) return NextResponse.json({ error: "Período inválido." }, { status: 400 });

  const carteira = await getCarteira(supabase, user.id);
  const ativo = carteira.estrutura.ativos.find((a) => a.codigo === codigo);
  if (!ativo) return NextResponse.json({ error: "Ativo não encontrado na carteira." }, { status: 404 });

  const ticker = ativo.ticker_cotacao;
  if (!ticker) return NextResponse.json({ error: "Este ativo não tem cotação de mercado para exibir o gráfico." }, { status: 404 });

  const chave = `${ticker}:${periodo.id}`;
  let chart: YahooChart | null;
  const hit = cache.get(chave);
  if (hit && hit.ate > Date.now()) chart = hit.chart;
  else {
    chart = await fetchYahooChart(ticker, { range: periodo.range, interval: periodo.intervalo });
    cache.set(chave, { ate: Date.now() + (chart && chart.dias.length ? TTL_MS : TTL_FALHA_MS), chart });
  }

  if (!chart || chart.dias.length === 0) {
    return NextResponse.json({ error: "Não foi possível carregar o histórico agora. Tente de novo em instantes." }, { status: 502 });
  }

  return NextResponse.json(
    {
      codigo,
      ticker,
      moeda: chart.moeda,
      pontos: chart.dias.map((d) => ({ data: d.data, fechamento: d.fechamento })),
    },
    { headers: { "Cache-Control": "private, max-age=600" } },
  );
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasInvestmentsAccess } from "@/lib/investments-access";
import { getCarteira } from "@/lib/carteira/dados";
import { buscarYahooSummary, montarInfo, type AtivoInfo, type YahooSummary } from "@/lib/carteira/ativo-info";

// Ficha do ativo para o popup da Visão geral. Só consulta ativos cadastrados na carteira do usuário
// (o ticker nunca vem do cliente). Cache em memória do servidor por 24 h para não repetir chamadas ao Yahoo.
export const maxDuration = 20;

const TTL_MS = 24 * 3600 * 1000;
const TTL_FALHA_MS = 10 * 60 * 1000; // falha do Yahoo: tenta de novo em 10 min
const cache = new Map<string, { ate: number; yahoo: YahooSummary | null }>();

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  if (!await hasInvestmentsAccess(supabase, user.id)) {
    return NextResponse.json({ error: "Sem acesso ao módulo de investimentos." }, { status: 403 });
  }

  const codigo = new URL(req.url).searchParams.get("codigo")?.trim();
  if (!codigo) return NextResponse.json({ error: "Informe o ativo." }, { status: 400 });

  const carteira = await getCarteira(supabase, user.id);
  const ativo = carteira.estrutura.ativos.find((a) => a.codigo === codigo);
  if (!ativo) return NextResponse.json({ error: "Ativo não encontrado na carteira." }, { status: 404 });

  const ticker = ativo.ticker_cotacao;
  let yahoo: YahooSummary | null = null;
  if (ticker) {
    const hit = cache.get(ticker);
    if (hit && hit.ate > Date.now()) yahoo = hit.yahoo;
    else {
      yahoo = await buscarYahooSummary(ticker);
      cache.set(ticker, { ate: Date.now() + (yahoo ? TTL_MS : TTL_FALHA_MS), yahoo });
    }
  }

  const info: AtivoInfo = montarInfo(ativo, yahoo);
  return NextResponse.json(info, { headers: { "Cache-Control": "private, max-age=3600" } });
}

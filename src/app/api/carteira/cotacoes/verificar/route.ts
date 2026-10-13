import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasInvestmentsAccess } from "@/lib/investments-access";
import { fetchYahooChart } from "@/lib/market/yahoo";

// Confere tickers de cotação (Configurações › Carteira): existe na fonte? em que moeda vem? qual o nome?
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  if (!await hasInvestmentsAccess(supabase, user.id)) {
    return NextResponse.json({ error: "Sem acesso ao módulo de investimentos." }, { status: 403 });
  }

  const tickers = [...new Set((request.nextUrl.searchParams.get("t") ?? "")
    .split(",").map((t) => t.trim().toUpperCase()).filter((t) => /^[A-Z0-9.^=\-]{1,20}$/.test(t)))].slice(0, 40);

  const resultados = await Promise.all(tickers.map(async (ticker) => {
    const chart = await fetchYahooChart(ticker, { range: "5d" });
    const ultimo = chart?.dias.at(-1);
    return chart && ultimo
      ? { ticker, ok: true, nome: chart.nome, moeda: chart.moeda, moedaOriginal: chart.moedaOriginal, preco: ultimo.fechamento, data: ultimo.data }
      : { ticker, ok: false };
  }));
  return NextResponse.json({ resultados });
}

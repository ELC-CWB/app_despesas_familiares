import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  atualizarCotacoes, atualizarIpca, atualizarPtax, gravarSnapshots, hojeSP, tickersDeTodasAsCarteiras,
} from "@/lib/carteira/mercado";

// Rotina diária da Carteira (Vercel Cron, ver vercel.json): fechamento de todos os tickers cadastrados,
// câmbios, PTAX, IPCA e a foto do patrimônio de cada carteira.
// Protegida pelo CRON_SECRET: a Vercel envia "Authorization: Bearer <CRON_SECRET>".
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada" }, { status: 500 });

  const resumo: Record<string, unknown> = { data: hojeSP() };
  try {
    const tickers = await tickersDeTodasAsCarteiras(admin);
    resumo.cotacoes = await atualizarCotacoes(admin, tickers, "5d");
  } catch (e) {
    resumo.cotacoes = { erro: e instanceof Error ? e.message : String(e) };
  }
  // Cada etapa independe das outras: uma falha (ex.: BCB fora do ar) não impede as demais
  for (const [nome, etapa] of [["ptax", atualizarPtax], ["ipca", atualizarIpca]] as const) {
    try { resumo[nome] = await etapa(admin); } catch (e) { resumo[nome] = { erro: e instanceof Error ? e.message : String(e) }; }
  }
  try {
    resumo.snapshots = await gravarSnapshots(admin);
  } catch (e) {
    resumo.snapshots = { erro: e instanceof Error ? e.message : String(e) };
  }
  return NextResponse.json(resumo);
}

import { NextRequest, NextResponse } from "next/server";
import { autorizarEscrita, erro } from "@/lib/carteira/api";

export type RegrasRetirada = {
  regra_protecao_on: boolean; regra_queda_pct: number; regra_corte_pct: number;
  regra_aumento_on: boolean; regra_gatilho_pct: number; regra_aumento_pct: number;
};

const percentual = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;

// Regras de ajuste da retirada (REGRAS §4): liga/desliga e dois percentuais cada
export async function PUT(request: NextRequest) {
  const auth = await autorizarEscrita();
  if (!auth.ok) return auth.resposta;

  const r = (await request.json()) as RegrasRetirada;
  if (typeof r.regra_protecao_on !== "boolean" || typeof r.regra_aumento_on !== "boolean") return erro("Regras inválidas.");
  if (![r.regra_queda_pct, r.regra_corte_pct, r.regra_gatilho_pct, r.regra_aumento_pct].every(percentual)) {
    return erro("Os percentuais das regras precisam estar entre 0% e 100%.");
  }

  const { error } = await auth.supabase.from("carteira_config").upsert({
    profile_id: auth.user.id,
    regra_protecao_on: r.regra_protecao_on, regra_queda_pct: r.regra_queda_pct, regra_corte_pct: r.regra_corte_pct,
    regra_aumento_on: r.regra_aumento_on, regra_gatilho_pct: r.regra_gatilho_pct, regra_aumento_pct: r.regra_aumento_pct,
  }, { onConflict: "profile_id" });
  if (error) return erro(error.message, 500);
  return NextResponse.json({ ok: true });
}

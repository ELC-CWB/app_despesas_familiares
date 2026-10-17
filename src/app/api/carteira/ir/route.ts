import { NextRequest, NextResponse } from "next/server";
import { autorizarEscrita, erro } from "@/lib/carteira/api";
import { hojeSP } from "@/lib/carteira/mercado";

// Marca (ou desmarca) o DARF de um mês como pago. O valor do imposto não é gravado: vem sempre das movimentações.
export async function PUT(request: NextRequest) {
  const auth = await autorizarEscrita();
  if (!auth.ok) return auth.resposta;

  const { competencia, pago, pago_em } = (await request.json().catch(() => ({}))) as { competencia?: string; pago?: boolean; pago_em?: string };
  if (!/^\d{4}-\d{2}-01$/.test(competencia ?? "")) return erro("Competência inválida.");
  if (typeof pago !== "boolean") return erro("Informe se o DARF foi pago.");

  const { error } = await auth.supabase.from("carteira_ir_mensal").upsert({
    profile_id: auth.user.id, competencia, categoria: "b3", darf_pago: pago,
    pago_em: pago ? (/^\d{4}-\d{2}-\d{2}$/.test(pago_em ?? "") ? pago_em : hojeSP()) : null,
  });
  if (error) return erro(error.message, 500);
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { autorizarEscrita, erro } from "@/lib/carteira/api";

// Passa a usar uma versão antiga do plano ("Usar a versão Y")
export async function POST(request: NextRequest) {
  const auth = await autorizarEscrita();
  if (!auth.ok) return auth.resposta;

  const { id } = (await request.json()) as { id: string };
  if (!/^[0-9a-f-]{36}$/i.test(id ?? "")) return erro("Versão inválida.");

  const { error } = await auth.supabase.rpc("carteira_usar_versao", { plano_id: id });
  if (error) return erro(error.message);
  return NextResponse.json({ ok: true });
}

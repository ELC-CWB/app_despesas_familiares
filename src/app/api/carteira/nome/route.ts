import { NextRequest, NextResponse } from "next/server";
import { autorizarEscrita, erro } from "@/lib/carteira/api";

// Renomeia a carteira (Configurações › Carteira). Nome vazio volta ao padrão.
export async function PUT(request: NextRequest) {
  const auth = await autorizarEscrita();
  if (!auth.ok) return auth.resposta;

  const { nome } = (await request.json().catch(() => ({}))) as { nome?: unknown };
  if (nome != null && typeof nome !== "string") return erro("Nome inválido.");
  const limpo = (nome ?? "").trim().replace(/\s+/g, " ");
  if (limpo.length > 60) return erro("O nome pode ter no máximo 60 caracteres.");

  const { error } = await auth.supabase
    .from("carteira_config")
    .upsert({ profile_id: auth.user.id, nome: limpo || null }, { onConflict: "profile_id" });
  if (error) return erro(/nome/.test(error.message) ? "Falta rodar a migração 20261019_carteira_nome.sql no Supabase." : error.message, 500);
  return NextResponse.json({ nome: limpo || null });
}

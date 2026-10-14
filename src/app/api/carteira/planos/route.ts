import { NextRequest, NextResponse } from "next/server";
import { autorizarEscrita, erro } from "@/lib/carteira/api";
import { validarPlano } from "@/lib/carteira/validacao";
import type { Premissas } from "@/lib/carteira/plano";

// Salva o plano (SPEC §4.3): 'atualizar' sobrescreve a versão em uso; 'nova' cria a versão seguinte.
export async function POST(request: NextRequest) {
  const auth = await autorizarEscrita();
  if (!auth.ok) return auth.resposta;

  const body = (await request.json()) as Premissas & { modo: "atualizar" | "nova" };
  if (body.modo !== "atualizar" && body.modo !== "nova") return erro("Escolha entre atualizar a versão e salvar como nova.");
  if (!Number.isInteger(body.ano_inicio) || body.ano_inicio < 1990 || body.ano_inicio > 2100) return erro("Informe um ano de início válido.");
  const msg = validarPlano(body);
  if (msg) return erro(msg);

  const { data, error } = await auth.supabase.rpc("carteira_salvar_plano", { p: body });
  if (error) return erro(error.message);
  return NextResponse.json({ id: data }, { status: 201 });
}

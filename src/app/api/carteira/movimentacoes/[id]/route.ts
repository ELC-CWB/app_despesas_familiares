import { NextRequest, NextResponse } from "next/server";
import { autorizarEscrita, erro } from "@/lib/carteira/api";
import { quantidadesPorAtivo } from "@/lib/carteira/patrimonio";

type Contexto = { params: Promise<{ id: string }> };

// Edita as observações de uma movimentação (SPEC §4.4: modal de detalhes)
export async function PATCH(request: NextRequest, { params }: Contexto) {
  const auth = await autorizarEscrita();
  if (!auth.ok) return auth.resposta;
  const { id } = await params;
  const { observacoes } = (await request.json()) as { observacoes: string | null };

  const { data, error } = await auth.supabase
    .from("carteira_movimentacoes")
    .update({ observacoes: observacoes?.trim() || null })
    .eq("id", id).eq("profile_id", auth.user.id)
    .select("id").maybeSingle();
  if (error) return erro(error.message, 500);
  if (!data) return erro("Movimentação não encontrada.", 404);
  return NextResponse.json({ ok: true });
}

// Exclui uma movimentação lançada por engano. Uma compra só sai se a posição continuar
// válida (as vendas posteriores não podem ficar sem cotas).
export async function DELETE(_request: NextRequest, { params }: Contexto) {
  const auth = await autorizarEscrita();
  if (!auth.ok) return auth.resposta;
  const { supabase, user } = auth;
  const { id } = await params;

  const { data: alvo } = await supabase
    .from("carteira_movimentacoes").select("id, ativo_id, tipo").eq("id", id).eq("profile_id", user.id).maybeSingle();
  if (!alvo) return erro("Movimentação não encontrada.", 404);

  if (alvo.tipo === "compra") {
    const { data: movs, error } = await supabase
      .from("carteira_movimentacoes").select("id, data, ativo_id, tipo, quantidade, valor_liquido_brl")
      .eq("profile_id", user.id).eq("ativo_id", alvo.ativo_id).order("data");
    if (error) return erro(error.message, 500);
    const restantes = (movs ?? []).filter((m) => m.id !== id)
      .map((m) => ({ ...m, quantidade: m.quantidade == null ? null : Number(m.quantidade), valor_liquido_brl: Number(m.valor_liquido_brl) }));
    // Em cada data com venda, a posição acumulada precisa continuar ≥ 0
    const fica = restantes.every((m) => m.tipo !== "venda"
      || (quantidadesPorAtivo(restantes.filter((x) => x.data <= m.data))[alvo.ativo_id] ?? 0) >= -1e-9);
    if (!fica) return erro("Não é possível excluir esta compra: há vendas posteriores que dependem dessas cotas.");
  }

  const { error } = await supabase.from("carteira_movimentacoes").delete().eq("id", id).eq("profile_id", user.id);
  if (error) return erro(error.message, 500);
  return NextResponse.json({ ok: true });
}

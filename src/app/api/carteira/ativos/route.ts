import { NextRequest, NextResponse } from "next/server";
import { autorizarEscrita, erro } from "@/lib/carteira/api";
import { TIPO_IDS, type TipoAtivo } from "@/lib/carteira/constantes";

// Cadastro rápido de ativo a partir de Movimentações › Compra (SPEC §4.4).
// Os demais detalhes (taxa, banda, ticker do exterior) ficam para Configurações.
export async function POST(request: NextRequest) {
  const auth = await autorizarEscrita();
  if (!auth.ok) return auth.resposta;
  const { supabase, user } = auth;

  const b = (await request.json()) as {
    codigo: string; tipo: TipoAtivo; mercado: "brasil" | "exterior"; bloco_id: string; alvo_pct: number; corretora_id: string | null;
  };
  const codigo = (b.codigo ?? "").trim().toUpperCase();
  if (!codigo) return erro("Informe o código do ativo.");
  if (!TIPO_IDS.includes(b.tipo)) return erro("Escolha o tipo do ativo.");
  if (!["brasil", "exterior"].includes(b.mercado)) return erro("Escolha o mercado do ativo.");
  if (!(b.alvo_pct >= 0 && b.alvo_pct <= 100)) return erro("O alvo precisa estar entre 0% e 100%.");

  const [{ data: bloco }, { data: existente }, { count }] = await Promise.all([
    supabase.from("carteira_blocos").select("id").eq("id", b.bloco_id).eq("profile_id", user.id).maybeSingle(),
    supabase.from("carteira_ativos").select("id").eq("profile_id", user.id).eq("codigo", codigo).maybeSingle(),
    supabase.from("carteira_ativos").select("id", { count: "exact", head: true }).eq("profile_id", user.id),
  ]);
  if (!bloco) return erro("Escolha um bloco da carteira.");
  if (existente) return erro(`${codigo} já está cadastrado. Escolha-o na lista de ativos.`);

  const { data, error } = await supabase.from("carteira_ativos").insert({
    profile_id: user.id,
    codigo,
    ticker_cotacao: b.mercado === "brasil" ? `${codigo}.SA` : null,
    tipo: b.tipo,
    mercado: b.mercado,
    moeda: b.mercado === "exterior" ? "USD" : "BRL",
    bloco_id: bloco.id,
    corretora_id: b.corretora_id || null,
    alvo_pct: b.alvo_pct,
    ordem: count ?? 0,
  }).select("id").single();
  if (error) return erro(error.message, 500);
  return NextResponse.json({ id: data.id }, { status: 201 });
}

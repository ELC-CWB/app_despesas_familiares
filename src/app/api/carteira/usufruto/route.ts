import { NextRequest, NextResponse } from "next/server";
import { autorizarEscrita, erro } from "@/lib/carteira/api";
import { getCarteira } from "@/lib/carteira/dados";
import { carregarUsufruto } from "@/lib/carteira/usufruto-dados";
import { hojeSP } from "@/lib/carteira/mercado";
import { saqueInicial } from "@/lib/carteira/usufruto";

const ehData = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

// Inicia o usufruto: o saque inicial é calculado aqui, a partir do patrimônio de hoje e da retirada do plano em uso.
export async function POST(request: NextRequest) {
  const auth = await autorizarEscrita();
  if (!auth.ok) return auth.resposta;

  const { inicio } = (await request.json().catch(() => ({}))) as { inicio?: string };
  const data = inicio ?? hojeSP();
  if (!ehData(data)) return erro("Informe uma data de início válida.");

  const carteira = await getCarteira(auth.supabase, auth.user.id);
  if (!carteira.config) return erro("Configure a carteira antes de iniciar o usufruto.");
  if (carteira.config.fase === "usufruto") return erro("O usufruto já foi iniciado.");
  if (!carteira.plano) return erro("Salve um plano antes de iniciar o usufruto: o saque inicial vem da retirada do plano.");

  const { total } = await carregarUsufruto(auth.supabase, carteira);
  if (total <= 0) return erro("A carteira ainda não tem patrimônio avaliado (faltam posições ou cotações).");

  const valor = Math.round(saqueInicial(total, carteira.plano.retirada_pct) * 100) / 100;
  const { error } = await auth.supabase.rpc("carteira_iniciar_usufruto", { p: { inicio: data, valor_mensal: valor } });
  if (error) return erro(error.message);
  return NextResponse.json({ valor_mensal: valor }, { status: 201 });
}

// Aceita ou recusa a sugestão de ajuste que a tela mostra. O valor vem do servidor, não do navegador.
export async function PUT(request: NextRequest) {
  const auth = await autorizarEscrita();
  if (!auth.ok) return auth.resposta;

  const { decisao, tipo } = (await request.json().catch(() => ({}))) as { decisao?: string; tipo?: string };
  if (decisao !== "aceito" && decisao !== "recusado") return erro("Escolha aceitar ou recusar.");

  const carteira = await getCarteira(auth.supabase, auth.user.id);
  const { estado, hoje } = await carregarUsufruto(auth.supabase, carteira);
  const alerta = estado?.alerta;
  if (!alerta) return erro("Não há sugestão de ajuste no momento. Atualize a página.", 409);
  if (tipo !== alerta.tipo) return erro("A sugestão mudou. Atualize a página.", 409);

  const { error } = await auth.supabase.rpc("carteira_registrar_retirada", {
    p: {
      data: hoje, motivo: alerta.tipo, decisao,
      valor_mensal: Math.round(alerta.novo_valor * 100) / 100,
      valor_anterior: alerta.tipo === "protecao" ? Math.round(alerta.valor_anterior * 100) / 100 : null,
    },
  });
  if (error) return erro(error.message);
  return NextResponse.json({ ok: true });
}

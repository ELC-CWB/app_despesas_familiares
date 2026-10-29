"use server";

import { garantirGrupoDespesas } from "@/lib/grupo-despesas";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_POR_HORA = 5; // tentativas de cadastro por IP

// Cria a conta já confirmada (sem e-mail de confirmação). O login automático é feito em seguida, no cliente.
// `site` é o campo escondido (honeypot): pessoas não o veem, robôs o preenchem.
export async function cadastrarUsuario(dados: { name: string; email: string; password: string; site?: string }): Promise<{ erro?: string }> {
  if (dados.site) return { erro: "Não foi possível criar a conta. Tente novamente." };

  const name = dados.name.trim();
  const email = dados.email.trim().toLowerCase();
  if (!name) return { erro: "Informe seu nome." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { erro: "E-mail inválido." };
  if (dados.password.length < 6) return { erro: "A senha deve ter pelo menos 6 caracteres." };

  const admin = createAdminClient();
  if (!admin) return { erro: "Cadastro indisponível no momento. Tente novamente mais tarde." };

  // Limite por IP guardado no banco (vale entre todas as instâncias do servidor). Se a tabela
  // ainda não existir, o cadastro segue sem o limite em vez de travar.
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "desconhecido";
  const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: erroLimite } = await admin
    .from("cadastro_tentativas").select("id", { count: "exact", head: true }).eq("ip", ip).gte("criado_em", desde);
  if (!erroLimite) {
    if ((count ?? 0) >= MAX_POR_HORA) return { erro: "Muitas tentativas de cadastro. Aguarde um pouco e tente novamente." };
    await admin.from("cadastro_tentativas").insert({ ip });
    await admin.from("cadastro_tentativas").delete().lt("criado_em", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  }

  const { data: criado, error } = await admin.auth.admin.createUser({
    email,
    password: dados.password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) return { erro: "Este e-mail já está cadastrado. Use a tela de login." };
    return { erro: "Não foi possível criar a conta. Tente novamente." };
  }
  // Já nasce com o grupo pessoal de Despesas; se falhar, ele é criado ao abrir Despesas
  if (criado?.user) await garantirGrupoDespesas(criado.user.id, name);
  return {};
}

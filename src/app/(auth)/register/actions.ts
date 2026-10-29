"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// Cria a conta já confirmada (sem e-mail de confirmação). O login automático é feito em seguida, no cliente.
export async function cadastrarUsuario(dados: { name: string; email: string; password: string }): Promise<{ erro?: string }> {
  const name = dados.name.trim();
  const email = dados.email.trim().toLowerCase();
  if (!name) return { erro: "Informe seu nome." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { erro: "E-mail inválido." };
  if (dados.password.length < 6) return { erro: "A senha deve ter pelo menos 6 caracteres." };

  const admin = createAdminClient();
  if (!admin) return { erro: "Cadastro indisponível no momento. Tente novamente mais tarde." };

  const { error } = await admin.auth.admin.createUser({
    email,
    password: dados.password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) return { erro: "Este e-mail já está cadastrado. Use a tela de login." };
    return { erro: "Não foi possível criar a conta. Tente novamente." };
  }
  return {};
}

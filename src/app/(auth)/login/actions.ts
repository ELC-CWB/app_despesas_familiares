"use server";

import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// Contas criadas antes do cadastro sem confirmação ficaram aguardando o e-mail de confirmação.
// O Supabase só devolve "Email not confirmed" depois de validar a senha; mesmo assim a senha é
// conferida aqui de novo antes de liberar a conta.
export async function liberarContaPendente(dados: { email: string; password: string }): Promise<{ ok: boolean }> {
  const email = dados.email.trim().toLowerCase();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const admin = createAdminClient();
  if (!url || !anon || !admin || !email || !dados.password) return { ok: false };

  const anonimo = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await anonimo.auth.signInWithPassword({ email, password: dados.password });
  if (!error || !/not confirmed/i.test(error.message)) return { ok: false };

  const { data: perfil } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (!perfil) return { ok: false };
  const { error: erroConfirmar } = await admin.auth.admin.updateUserById(perfil.id, { email_confirm: true });
  return { ok: !erroConfirmar };
}

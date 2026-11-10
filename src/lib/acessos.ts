"use server";

import { createClient } from "@/lib/supabase/server";

export type AppAcesso = "despesas" | "investimentos";

// Registra uma visita do usuário logado a um app (a função do banco decide se conta como nova visita)
export async function registrarAcesso(app: AppAcesso): Promise<void> {
  if (app !== "despesas" && app !== "investimentos") return;
  const supabase = await createClient();
  await supabase.rpc("registrar_acesso_app", { p_app: app });
}

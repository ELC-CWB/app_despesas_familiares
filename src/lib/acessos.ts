"use server";

import { createClient } from "@/lib/supabase/server";

// Registra uma visita do usuário logado (a função do banco decide se conta como nova visita)
export async function registrarAcesso(): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("registrar_acesso");
}

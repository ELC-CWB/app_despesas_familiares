import type { SupabaseClient } from "@supabase/supabase-js";

// Investimentos está liberado para todo usuário logado: cada conta tem a própria carteira
// (as políticas do banco já isolam os dados por conta e por grupo).
export async function hasInvestmentsAccess(_supabase: SupabaseClient, userId: string): Promise<boolean> {
  return !!userId;
}

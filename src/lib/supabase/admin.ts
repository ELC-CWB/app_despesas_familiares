import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente com a chave service_role: ignora o RLS. SÓ no servidor (rotas de API e rotina diária),
// nunca em componentes de cliente. Usado para gravar dados de mercado compartilhados e as fotos diárias.
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return null;
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

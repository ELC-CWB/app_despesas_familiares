import type { SupabaseClient } from "@supabase/supabase-js";

export async function hasInvestmentsAccess(supabase: SupabaseClient, userId: string): Promise<boolean> {
  // Check has_investments_access flag
  const { data: profile } = await supabase
    .from("profiles")
    .select("has_investments_access")
    .eq("id", userId)
    .single();

  if (profile?.has_investments_access) return true;

  // Fallback: check via SECURITY DEFINER function (bypasses RLS)
  const { data: isAdmin } = await supabase.rpc("is_investment_admin");
  return !!isAdmin;
}

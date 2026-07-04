import type { SupabaseClient } from "@supabase/supabase-js";

export async function hasInvestmentsAccess(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("has_investments_access, investment_group_id")
    .eq("id", userId)
    .single();

  if (profile?.has_investments_access) return true;

  if (profile?.investment_group_id) {
    const { data: group } = await supabase
      .from("investment_groups")
      .select("created_by")
      .eq("id", profile.investment_group_id)
      .single();
    if (group?.created_by === userId) return true;
  }

  return false;
}

import type { SupabaseClient } from "@supabase/supabase-js";

export interface InvestmentTarget {
  targetProfileId: string;
  isReadOnly: boolean;
  ownerName: string | null;
}

// Determines if `userId` is a non-admin group member (views admin's investments read-only).
// Shared by stock (Ações) and fixed-income (Renda Fixa) summaries so both asset
// classes resolve to the same target/owner in a single request.
export async function resolveInvestmentTarget(supabase: SupabaseClient, userId: string): Promise<InvestmentTarget> {
  let targetProfileId = userId;
  let isReadOnly = false;
  let ownerName: string | null = null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("investment_group_id")
    .eq("id", userId)
    .single();

  if (profile?.investment_group_id) {
    const { data: group } = await supabase
      .from("investment_groups")
      .select("created_by")
      .eq("id", profile.investment_group_id)
      .single();

    if (group && group.created_by !== userId) {
      targetProfileId = group.created_by;
      isReadOnly = true;
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", group.created_by)
        .single();
      ownerName = adminProfile?.name ?? null;
    }
  }

  return { targetProfileId, isReadOnly, ownerName };
}

import type { SupabaseClient } from "@supabase/supabase-js";

export async function hasTalkieAccess(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("has_talkie_access")
    .eq("id", userId)
    .single();
  return !!profile?.has_talkie_access;
}

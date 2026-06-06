"use server";

import { createClient } from "./server";
import type { Expense, ExpenseFilters, Profile } from "@/types";

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return data;
}

export async function getGroupMembers(groupId: string): Promise<Profile[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("group_id", groupId)
    .order("name");

  return data ?? [];
}

export async function getExpenses(
  groupId: string,
  filters: ExpenseFilters
): Promise<Expense[]> {
  const supabase = await createClient();

  let query = supabase
    .from("expenses")
    .select("*, profiles(id, name, email, avatar_url)")
    .eq("group_id", groupId)
    .order("date", { ascending: false });

  if (filters.month) query = query.eq("payment_month", filters.month);
  if (filters.year) query = query.eq("payment_year", filters.year);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.user_id) query = query.eq("user_id", filters.user_id);

  const { data } = await query;
  return data ?? [];
}

export async function createExpense(
  expense: Omit<Expense, "id" | "created_at" | "updated_at" | "profiles">
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").insert(expense);
  return { error: error?.message ?? null };
}

export async function updateExpense(
  id: string,
  expense: Partial<Omit<Expense, "id" | "created_at" | "profiles">>
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("expenses")
    .update({ ...expense, updated_at: new Date().toISOString() })
    .eq("id", id);
  return { error: error?.message ?? null };
}

export async function deleteExpense(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  return { error: error?.message ?? null };
}

export async function inviteToGroup(
  groupId: string,
  email: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { error } = await supabase.from("group_invites").insert({
    group_id: groupId,
    invited_email: email,
    invited_by: user.id,
  });

  return { error: error?.message ?? null };
}

export async function getPendingInvites(email: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("group_invites")
    .select("*, groups(id, name), profiles(name, email)")
    .eq("invited_email", email)
    .eq("accepted", false);

  return data ?? [];
}

export async function acceptInvite(inviteId: string, groupId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { error: updateError } = await supabase
    .from("group_invites")
    .update({ accepted: true })
    .eq("id", inviteId);

  if (updateError) return { error: updateError.message };

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ group_id: groupId })
    .eq("id", user.id);

  return { error: profileError?.message ?? null };
}

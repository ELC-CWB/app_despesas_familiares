import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { ExpensesClient } from "@/components/expenses/expenses-client";

export default async function ExpensesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile?.group_id) {
    return (
      <div>
        <Header title="Despesas" profile={profile} />
        <div className="p-6 text-center text-muted-foreground">
          Você ainda não está em um grupo.
        </div>
      </div>
    );
  }

  const [{ data: expenses, error: expensesError }, { data: members, error: membersError }, { data: group }, { data: categories }] = await Promise.all([
    supabase
      .from("expenses")
      .select("*, profiles(id, name, email, avatar_url)")
      .eq("group_id", profile.group_id)
      .order("date", { ascending: false }),
    supabase
      .from("profiles")
      .select("*")
      .eq("group_id", profile.group_id),
    supabase
      .from("groups")
      .select("name")
      .eq("id", profile.group_id)
      .single(),
    supabase
      .from("group_categories")
      .select("*")
      .eq("group_id", profile.group_id)
      .order("position"),
  ]);

  if (expensesError) console.error("[expenses page] expenses query error:", expensesError.message, expensesError.code);
  if (membersError) console.error("[expenses page] members query error:", membersError.message, membersError.code);

  return (
    <div>
      <Header title="Despesas" subtitle="Todos os lançamentos do grupo" profile={profile} groupName={group?.name} />
      <div className="p-5 lg:p-8">
        <ExpensesClient
          initialExpenses={expenses ?? []}
          members={members ?? []}
          currentUserId={user.id}
          groupId={profile.group_id}
          categories={categories ?? []}
        />
      </div>
    </div>
  );
}

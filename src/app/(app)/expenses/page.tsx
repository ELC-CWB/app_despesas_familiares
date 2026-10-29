import { createClient } from "@/lib/supabase/server";
import { garantirCategoriasPadrao } from "@/lib/categorias-padrao";
import { SemGrupo } from "@/components/layout/sem-grupo";
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
        <SemGrupo />
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

  // Grupo recém-criado ainda não tem categorias: cria as padrão
  const categoriasDoGrupo = categories && categories.length > 0 ? categories : await garantirCategoriasPadrao(supabase, profile.group_id);

  if (expensesError) console.error("[expenses page] expenses query error:", expensesError.message, expensesError.code);
  if (membersError) console.error("[expenses page] members query error:", membersError.message, membersError.code);

  return (
    <ExpensesClient
      initialExpenses={expenses ?? []}
      members={members ?? []}
      currentUserId={user.id}
      groupId={profile.group_id}
      categories={categoriasDoGrupo}
      profile={profile}
      groupName={group?.name ?? null}
    />
  );
}

import { createClient } from "@/lib/supabase/server";
import { garantirGrupoDespesas } from "@/lib/grupo-despesas";
import { garantirCategoriasPadrao } from "@/lib/categorias-padrao";
import { SemGrupo } from "@/components/layout/sem-grupo";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { ExpensesClient } from "@/components/expenses/expenses-client";
import { TIPO_TEXTOS, type ExpenseType } from "@/types";

// Página compartilhada de lançamentos: despesas (/expenses) e receitas (/incomes)
export async function LancamentosPage({ tipo }: { tipo: ExpenseType }) {
  const rota = tipo === "receita" ? "/incomes" : "/expenses";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile?.group_id) {
    // Sem grupo: prepara o grupo pessoal de Despesas e recarrega a página
    if (await garantirGrupoDespesas(user.id, profile?.name ?? "")) redirect(rota);
    return (
      <div>
        <Header title={TIPO_TEXTOS[tipo].titulo} profile={profile} />
        <SemGrupo />
      </div>
    );
  }

  const [{ data: expenses, error: expensesError }, { data: members, error: membersError }, { data: group }, { data: categories }] = await Promise.all([
    supabase
      .from("expenses")
      .select("*, profiles(id, name, email, avatar_url)")
      .eq("group_id", profile.group_id)
      .eq("type", tipo)
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

  // Grupo recém-criado (ou sem categorias deste tipo): cria as padrão
  const todas = categories ?? [];
  const doTipo = todas.filter((c) => (c.tipo ?? "despesa") === tipo);
  const categoriasDoGrupo = doTipo.length > 0
    ? doTipo
    : (await garantirCategoriasPadrao(supabase, profile.group_id)).filter((c) => (c.tipo ?? "despesa") === tipo);

  if (expensesError) console.error(`[${rota} page] query error:`, expensesError.message, expensesError.code);
  if (membersError) console.error(`[${rota} page] members query error:`, membersError.message, membersError.code);

  return (
    <ExpensesClient
      tipo={tipo}
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

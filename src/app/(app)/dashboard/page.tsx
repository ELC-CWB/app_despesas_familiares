import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { CategoryChart } from "@/components/dashboard/category-chart";
import { UserChart } from "@/components/dashboard/user-chart";
import { MonthlyTrendChart } from "@/components/dashboard/monthly-trend-chart";
import { MONTHS } from "@/types";

export default async function DashboardPage() {
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
        <Header title="Dashboard" profile={profile} />
        <div className="p-6 text-center text-muted-foreground">
          Você ainda não está em um grupo. Acesse as configurações para criar ou entrar em um grupo.
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

  if (expensesError) console.error("[dashboard] expenses query error:", expensesError.message, expensesError.code);
  if (membersError) console.error("[dashboard] members query error:", membersError.message, membersError.code);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const safeExpenses = expenses ?? [];
  const safeMembers = members ?? [];

  return (
    <div>
      <Header
        title="Dashboard"
        subtitle={`${MONTHS[currentMonth]} ${currentYear}`}
        profile={profile}
        groupName={group?.name}
      />
      <div className="p-5 lg:p-8 space-y-6">
        <SummaryCards
          expenses={safeExpenses}
          members={safeMembers}
          currentMonth={currentMonth}
          currentYear={currentYear}
          categories={categories ?? []}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CategoryChart expenses={safeExpenses} month={currentMonth} year={currentYear} categories={categories ?? []} />
          <UserChart expenses={safeExpenses} members={safeMembers} month={currentMonth} year={currentYear} />
        </div>

        <MonthlyTrendChart expenses={safeExpenses} year={currentYear} />
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { PieChart } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";

// Visão geral da Carteira (docs/carteira/SPEC.md §4.2) — em construção.
export default async function InvestmentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (
    <div>
      <Header title="Visão geral" subtitle="Carteira de investimentos" profile={profile} />
      <div className="p-5 lg:p-8">
        <div className="rounded-2xl border border-border bg-card p-10 shadow-sm flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(59,130,246,0.1)" }}>
            <PieChart className="h-6 w-6" style={{ color: "#3b82f6" }} />
          </div>
          <p className="text-base font-bold text-foreground">Em construção</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            A nova carteira de investimentos está sendo montada. Em breve você poderá cadastrar sua estratégia aqui.
          </p>
        </div>
      </div>
    </div>
  );
}

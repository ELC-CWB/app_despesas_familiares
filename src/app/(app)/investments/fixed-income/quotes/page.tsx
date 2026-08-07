import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { FixedIncomeQuotesClient } from "@/components/investments/fixed-income-quotes-client";

export default async function FixedIncomeQuotesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  return (
    <div>
      <Header title="Cotações" profile={profile} />
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <FixedIncomeQuotesClient />
      </div>
    </div>
  );
}

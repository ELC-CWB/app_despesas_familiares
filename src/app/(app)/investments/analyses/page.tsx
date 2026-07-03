import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { AnalysesClient } from "@/components/investments/analyses-client";

export default async function AnalysesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  return (
    <div>
      <Header title="Análises" profile={profile} />
      <div className="p-4 md:p-6">
        <AnalysesClient />
      </div>
    </div>
  );
}

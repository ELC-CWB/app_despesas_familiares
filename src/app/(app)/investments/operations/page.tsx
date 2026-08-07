import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { OperationsClient } from "@/components/investments/operations-client";

export default async function OperationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  return (
    <div>
      <Header title="Operações" profile={profile} />
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <OperationsClient />
      </div>
    </div>
  );
}

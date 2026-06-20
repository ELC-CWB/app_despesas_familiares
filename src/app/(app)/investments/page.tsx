import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { TrendingUp } from "lucide-react";

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
      <Header title="Investimentos Familiares" profile={profile} />
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: "hsl(var(--secondary))" }}
        >
          <TrendingUp className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <h2
            className="text-xl font-bold text-foreground"
            style={{ fontFamily: "Sora, sans-serif" }}
          >
            Em breve
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            O módulo de investimentos está em desenvolvimento e será disponibilizado em breve.
          </p>
        </div>
      </div>
    </div>
  );
}

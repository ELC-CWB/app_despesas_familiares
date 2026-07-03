import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { TrendingUp } from "lucide-react";

export default async function EvolutionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  return (
    <div>
      <Header title="Evolução" profile={profile} />
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(59,130,246,0.1)" }}>
          <TrendingUp className="w-8 h-8" style={{ color: "#3b82f6" }} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>Evolução</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">Em desenvolvimento.</p>
        </div>
      </div>
    </div>
  );
}

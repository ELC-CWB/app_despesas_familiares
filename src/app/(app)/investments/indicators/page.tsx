import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { IndicatorsClient } from "@/components/investments/indicators-client";

export default async function IndicatorsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: tickers }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("investment_tickers").select("symbol").eq("profile_id", user.id).order("created_at"),
  ]);

  const symbols = (tickers ?? []).map((t) => t.symbol);

  return (
    <div>
      <Header title="Indicadores" profile={profile} />
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <Suspense>
          <IndicatorsClient symbols={symbols} />
        </Suspense>
      </div>
    </div>
  );
}

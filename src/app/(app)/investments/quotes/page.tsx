import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { QuotesClient } from "@/components/investments/quotes-client";

export default async function QuotesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  const { data: savedTickers } = await supabase
    .from("investment_tickers")
    .select("symbol")
    .eq("profile_id", user.id)
    .order("created_at");

  const symbols = (savedTickers ?? []).map((t) => t.symbol);

  let initialQuotes: object[] = [];
  if (symbols.length > 0) {
    try {
      const res = await fetch(
        `https://brapi.dev/api/quote/${symbols.join(",")}?token=${process.env.BRAPI_TOKEN}&fundamental=true`,
        { next: { revalidate: 30 } }
      );
      if (res.ok) {
        const data = await res.json();
        initialQuotes = data.results ?? [];
      }
    } catch {
      // Client will retry on mount
    }
  }

  return (
    <div>
      <Header title="Cotações" subtitle="B3 · Bovespa" profile={profile} />
      <div className="p-5 lg:p-8">
        <QuotesClient
          profileId={user.id}
          initialSymbols={symbols}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          initialQuotes={initialQuotes as any}
        />
      </div>
    </div>
  );
}

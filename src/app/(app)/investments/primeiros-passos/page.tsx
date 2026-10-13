import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { CotacaoDolar } from "@/components/carteira/cotacao-dolar";
import { getCarteira, temEstrutura } from "@/lib/carteira/dados";
import { PrimeirosPassosClient } from "@/components/carteira/primeiros-passos-client";

// Primeiros passos (docs/carteira/SPEC.md §4.1): atalho opcional para montar a estratégia.
// Só faz sentido com a carteira vazia; depois disso, os ajustes ficam em Configurações.
export default async function PrimeirosPassosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, carteira] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    getCarteira(supabase, user.id),
  ]);

  if (carteira.isReadOnly) redirect("/investments");
  if (temEstrutura(carteira)) redirect("/investments/settings/carteira");

  return (
    <div>
      <Header title="Primeiros passos" subtitle="Monte a estratégia da sua carteira" profile={profile} acessorio={<CotacaoDolar />} />
      <div className="p-5 lg:p-8">
        <PrimeirosPassosClient />
      </div>
    </div>
  );
}

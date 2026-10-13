import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { ConfiguracoesClient } from "@/components/carteira/configuracoes-client";
import { getCarteira, temEstrutura } from "@/lib/carteira/dados";

// Configurações › Carteira (docs/carteira/SPEC.md §4.5): corretoras, geografias e blocos, ativos e impostos.
export default async function ConfiguracoesCarteiraPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, carteira] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    getCarteira(supabase, user.id),
  ]);

  return (
    <div>
      <Header title="Carteira" subtitle="Corretoras, ativos, custos e impostos usados nas estimativas de compras e vendas" profile={profile} />
      <div className="p-5 lg:p-8 space-y-4">
        {!carteira.isReadOnly && !temEstrutura(carteira) && (
          <p className="text-sm text-muted-foreground">
            Carteira vazia. Cadastre cada parte abaixo ou, se preferir, use os{" "}
            <Link href="/investments/primeiros-passos" className="font-semibold" style={{ color: "#3b82f6" }}>Primeiros passos</Link>.
          </p>
        )}
        <ConfiguracoesClient
          estruturaInicial={carteira.estrutura}
          isReadOnly={carteira.isReadOnly}
          ownerName={carteira.ownerName}
        />
      </div>
    </div>
  );
}

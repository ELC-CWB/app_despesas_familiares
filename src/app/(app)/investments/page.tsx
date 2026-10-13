import Link from "next/link";
import { redirect } from "next/navigation";
import { PieChart } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { getCarteira, temEstrutura } from "@/lib/carteira/dados";
import { fmtNum } from "@/lib/carteira/numeros";
import { alvosFecham100, somaAlvos } from "@/lib/carteira/regras";

const ACCENT = "#3b82f6";

// Visão geral da Carteira (docs/carteira/SPEC.md §4.2). Abre sempre, mesmo sem dados;
// gráfico e tabela Real x planejado chegam com as cotações (PLANO.md, Fases 2 e 4).
export default async function InvestmentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, carteira] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    getCarteira(supabase, user.id),
  ]);

  const { ativos, blocos } = carteira.estrutura;
  const vazia = !temEstrutura(carteira);
  const soma = somaAlvos(ativos);

  return (
    <div>
      <Header title="Visão geral" subtitle="Carteira de investimentos" profile={profile} />
      <div className="p-5 lg:p-8">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm flex flex-col items-center gap-3 text-center max-w-xl mx-auto">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(59,130,246,0.1)" }}>
            <PieChart className="h-6 w-6" style={{ color: ACCENT }} />
          </div>

          {vazia ? (
            <>
              <p className="text-base font-bold text-foreground">Nenhuma estratégia cadastrada</p>
              <p className="text-sm text-muted-foreground">
                {carteira.isReadOnly
                  ? `${carteira.ownerName ?? "O administrador do grupo"} ainda não montou a estratégia da carteira.`
                  : "Monte a estratégia passo a passo ou cadastre cada parte direto em Configurações."}
              </p>
              {!carteira.isReadOnly && (
                <div className="flex flex-wrap justify-center gap-2 mt-1">
                  <Link href="/investments/primeiros-passos"
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: ACCENT }}>
                    Primeiros passos
                  </Link>
                  <Link href="/investments/settings/carteira"
                    className="px-4 py-2 rounded-lg text-sm font-semibold border border-border hover:bg-secondary/50 transition-colors">
                    Ir para Configurações
                  </Link>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-base font-bold text-foreground">
                {ativos.length} {ativos.length === 1 ? "ativo" : "ativos"} em {blocos.length} {blocos.length === 1 ? "bloco" : "blocos"}
              </p>
              {ativos.length > 0 && !alvosFecham100(soma) && (
                <p className="text-sm font-semibold" style={{ color: "#B42318" }}>
                  A soma dos alvos está em {fmtNum(soma, 1, 2)}%: a estratégia só fecha com 100%.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                O gráfico e a tabela Real x planejado aparecem aqui quando as cotações estiverem disponíveis.
              </p>
              <Link href="/investments/settings/carteira" className="text-sm font-semibold" style={{ color: ACCENT }}>
                Ver Configurações
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { LineChart } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { CotacaoDolar } from "@/components/carteira/cotacao-dolar";
import { getCarteira, temEstrutura } from "@/lib/carteira/dados";
import { fmtBRL, fmtNum } from "@/lib/carteira/numeros";
import { patrimonioFimAcumulacao, retiradaMaxPerpetua, vereditoPerpetuidade } from "@/lib/carteira/regras";

const ACCENT = "#3b82f6";

// Plano (docs/carteira/SPEC.md §4.3). Por enquanto mostra as premissas do plano em uso;
// simulação, túnel, versões e ajustes da retirada chegam na Fase 5 (PLANO.md).
export default async function PlanoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, carteira] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    getCarteira(supabase, user.id),
  ]);
  const p = carteira.plano;

  return (
    <div>
      <Header title="Plano" subtitle="Acumulação e usufruto da carteira" profile={profile} acessorio={<CotacaoDolar />} />
      <div className="p-5 lg:p-8 space-y-4 max-w-4xl">
        {!p ? (
          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(59,130,246,0.1)" }}>
              <LineChart className="h-6 w-6" style={{ color: ACCENT }} />
            </div>
            <p className="text-base font-bold text-foreground">Nenhum plano cadastrado</p>
            <p className="text-sm text-muted-foreground max-w-md">
              {carteira.isReadOnly
                ? `${carteira.ownerName ?? "O administrador do grupo"} ainda não cadastrou o plano.`
                : "A edição do plano, com o túnel entre os cenários pessimista e otimista, chega em breve nesta tela."}
            </p>
            {!carteira.isReadOnly && !temEstrutura(carteira) && (
              <Link href="/investments/primeiros-passos" className="text-sm font-semibold" style={{ color: ACCENT }}>
                Criar o plano nos Primeiros passos
              </Link>
            )}
          </div>
        ) : (
          <PlanoResumo p={p} />
        )}
      </div>
    </div>
  );
}

function PlanoResumo({ p }: { p: NonNullable<Awaited<ReturnType<typeof getCarteira>>["plano"]> }) {
  const lo = patrimonioFimAcumulacao(p.patrimonio_inicial, p.aporte_mensal, p.anos_aporte, p.rent_pess_pct);
  const hi = patrimonioFimAcumulacao(p.patrimonio_inicial, p.aporte_mensal, p.anos_aporte, p.rent_otim_pct);
  const ret = p.retirada_pct / 100;
  const veredito = vereditoPerpetuidade(p.retirada_pct, p.rent_pess_pct, p.rent_otim_pct);
  const maxPess = retiradaMaxPerpetua(p.rent_pess_pct);
  const brl0 = (v: number) => fmtBRL(v, 0);
  const cor = veredito === "verde" ? "#2E6B3F" : veredito === "amarelo" ? "#8A5A00" : "#B42318";

  const premissas: [string, string][] = [
    ["Patrimônio inicial", fmtBRL(p.patrimonio_inicial)],
    ["Aporte mensal", fmtBRL(p.aporte_mensal)],
    ["Anos de aporte", String(p.anos_aporte)],
    ["Usufruto", p.perpetuo ? "Perpétuo" : `${p.anos_usufruto} anos`],
    ["Retirada anual", `${fmtNum(p.retirada_pct, 1, 2)}%`],
    ["Rentabilidade real", `${fmtNum(p.rent_pess_pct, 1, 2)}% a ${fmtNum(p.rent_otim_pct, 1, 2)}% a.a.`],
  ];

  return (
    <>
      {p.perpetuo && (
        <div className="rounded-xl px-4 py-3 text-sm font-semibold" style={{ color: cor, backgroundColor: `${cor}14` }}>
          {veredito === "verde" && "Perpétua mesmo no cenário pessimista"}
          {veredito === "amarelo" && "Perpétua só no cenário otimista"}
          {veredito === "vermelho" && "Não é perpétua"}
          {veredito !== "verde" && (
            <span className="block text-xs font-medium mt-0.5">
              Retirada máxima perpétua no pessimista: {fmtNum(maxPess, 1, 2)}% a.a. ({brl0((lo * maxPess) / 100 / 12)}/mês)
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Cartao rotulo="Início do usufruto" valor={String(p.ano_inicio + p.anos_aporte)} />
        <Cartao rotulo="Patrimônio no início do usufruto" valor={`${brl0(lo)} a ${brl0(hi)}`} />
        <Cartao rotulo="Retirada mensal bruta" valor={`${brl0((lo * ret) / 12)} a ${brl0((hi * ret) / 12)}`} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm">
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <h2 className="text-base font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>Premissas</h2>
          <span className="text-xs text-muted-foreground">Versão {p.versao} · em uso</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {premissas.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 text-sm border-b border-border/60 py-1.5">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-semibold text-foreground tabular-nums">{v}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Valores em reais de hoje. A simulação com o túnel, as versões e as sugestões de ajuste da retirada chegam em breve nesta tela.
        </p>
      </div>
    </>
  );
}

function Cartao({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground font-medium">{rotulo}</p>
      <p className="text-base font-bold text-foreground mt-1 tabular-nums">{valor}</p>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { GruposClient, type GrupoDados } from "@/components/grupos/grupos-client";

// Grupos: gerencia num só lugar os grupos de Despesas e de Investimentos
export default async function GruposPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  async function carregar(tabelaGrupo: string, tabelaConvites: string, colunaPerfil: string, grupoId: string | null): Promise<GrupoDados> {
    const email = (user!.email ?? "").toLowerCase();
    const { data: convitesParaMim } = await supabase
      .from(tabelaConvites).select(`id, group_id, ${tabelaGrupo}(name)` as string).ilike("invited_email", email).eq("accepted", false);
    type LinhaConvite = { id: string; group_id: string } & Record<string, unknown>;
    const meusConvites = ((convitesParaMim ?? []) as unknown as LinhaConvite[]).map((c) => {
      const g = c[tabelaGrupo] as { name: string } | null;
      return { id: c.id, group_id: c.group_id, nome: g?.name ?? "Grupo" };
    });

    if (!grupoId) return { grupo: null, membros: [], convites: [], meusConvites };
    const [{ data: grupo }, { data: membros }, { data: convites }] = await Promise.all([
      supabase.from(tabelaGrupo).select("id, name, created_by").eq("id", grupoId).single(),
      supabase.from("profiles").select("id, name, email").eq(colunaPerfil, grupoId).order("name"),
      supabase.from(tabelaConvites).select("id, invited_email").eq("group_id", grupoId).eq("accepted", false),
    ]);
    return { grupo: grupo ?? null, membros: membros ?? [], convites: convites ?? [], meusConvites };
  }

  const [despesas, investimentos] = await Promise.all([
    carregar("groups", "group_invites", "group_id", profile?.group_id ?? null),
    carregar("investment_groups", "investment_group_invites", "investment_group_id", profile?.investment_group_id ?? null),
  ]);

  return (
    <div>
      <Header title="Grupos" subtitle="Quem vê as suas despesas e os seus investimentos" profile={profile} />
      <div className="p-5 lg:p-8">
        <GruposClient userId={user.id} despesas={despesas} investimentos={investimentos} />
      </div>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { InvestmentSettingsClient } from "@/components/investments/investment-settings-client";

export default async function InvestmentSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  let group = null;
  let members: { id: string; name: string; email: string; avatar_url: string | null; group_id: string | null; investment_group_id: string | null; created_at: string }[] = [];
  let pendingInvites: { id: string; invited_email: string; accepted: boolean; created_at: string }[] = [];

  if (profile?.investment_group_id) {
    const [{ data: groupData }, { data: membersData }, { data: invitesData }] = await Promise.all([
      supabase.from("investment_groups").select("*").eq("id", profile.investment_group_id).single(),
      supabase.from("profiles").select("*").eq("investment_group_id", profile.investment_group_id).order("name"),
      supabase.from("investment_group_invites").select("*").eq("group_id", profile.investment_group_id).eq("accepted", false),
    ]);
    group = groupData;
    members = membersData ?? [];
    pendingInvites = invitesData ?? [];
  }

  const { data: myInvites } = await supabase
    .from("investment_group_invites")
    .select("*, investment_groups(id, name)")
    .eq("invited_email", user.email!)
    .eq("accepted", false);

  const isAdmin = !!group && group.created_by === user.id;

  return (
    <div>
      <Header title="Configurações" subtitle="Grupo de investimentos" profile={profile} />
      <div className="p-5 lg:p-8">
        <InvestmentSettingsClient
          profile={profile}
          group={group}
          members={members}
          pendingInvites={pendingInvites}
          myInvites={myInvites ?? []}
          currentUserId={user.id}
          isAdmin={isAdmin}
        />
      </div>
    </div>
  );
}

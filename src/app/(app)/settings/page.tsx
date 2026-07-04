import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { SettingsClient } from "@/components/settings/settings-client";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  let group = null;
  let members: { id: string; name: string; email: string; avatar_url: string | null; group_id: string | null; investment_group_id: string | null; has_investments_access: boolean; created_at: string }[] = [];
  let pendingInvites: { id: string; invited_email: string; accepted: boolean; created_at: string }[] = [];
  let categories: { id: string; group_id: string; label: string; emoji: string; color: string; position: number; created_at: string }[] = [];

  if (profile?.group_id) {
    const [{ data: groupData }, { data: membersData }, { data: invitesData }, { data: categoriesData }] = await Promise.all([
      supabase.from("groups").select("*").eq("id", profile.group_id).single(),
      supabase.from("profiles").select("*").eq("group_id", profile.group_id).order("name"),
      supabase.from("group_invites").select("*").eq("group_id", profile.group_id).eq("accepted", false),
      supabase.from("group_categories").select("*").eq("group_id", profile.group_id).order("position"),
    ]);
    group = groupData;
    members = membersData ?? [];
    pendingInvites = invitesData ?? [];
    categories = categoriesData ?? [];
  }

  const { data: myInvites } = await supabase
    .from("group_invites")
    .select("*, groups(id, name)")
    .eq("invited_email", user.email!)
    .eq("accepted", false);

  const isAdmin = !!group && group.created_by === user.id;

  return (
    <div>
      <Header title="Configurações" subtitle="Grupo e perfil" profile={profile} />
      <div className="p-5 lg:p-8">
        <SettingsClient
          profile={profile}
          group={group}
          members={members}
          pendingInvites={pendingInvites}
          myInvites={myInvites ?? []}
          currentUserId={user.id}
          categories={categories}
          isAdmin={isAdmin}
        />
      </div>
    </div>
  );
}

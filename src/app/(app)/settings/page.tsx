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
  let categories: { id: string; group_id: string; label: string; emoji: string; color: string; position: number; created_at: string }[] = [];

  if (profile?.group_id) {
    const [{ data: groupData }, { data: categoriesData }] = await Promise.all([
      supabase.from("groups").select("*").eq("id", profile.group_id).single(),
      supabase.from("group_categories").select("*").eq("group_id", profile.group_id).order("position"),
    ]);
    group = groupData;
    categories = categoriesData ?? [];
  }

  const isAdmin = !!group && group.created_by === user.id;

  return (
    <div>
      <Header title="Configurações" subtitle="Perfil e categorias" profile={profile} />
      <div className="p-5 lg:p-8">
        <SettingsClient
          profile={profile}
          group={group}
          currentUserId={user.id}
          categories={categories}
          isAdmin={isAdmin}
        />
      </div>
    </div>
  );
}

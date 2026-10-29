// src/app/talkie/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin";
import TalkieChat from "@/components/TalkieChat";

// Talkie: só o administrador da plataforma
export default async function TalkiePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isPlatformAdmin(user.email)) redirect("/dashboard");
  return <TalkieChat />;
}

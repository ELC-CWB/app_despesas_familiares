import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasInvestmentsAccess } from "@/lib/investments-access";

export default async function GoalsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!await hasInvestmentsAccess(supabase, user.id)) redirect("/dashboard");

  return <>{children}</>;
}

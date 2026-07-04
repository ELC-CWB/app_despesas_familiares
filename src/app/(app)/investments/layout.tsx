import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function InvestmentsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("has_investments_access")
    .eq("id", user.id)
    .single();

  if (!profile?.has_investments_access) redirect("/dashboard");

  return <>{children}</>;
}

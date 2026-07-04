"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function HomeLogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="absolute bottom-6 left-6 z-10 flex items-center gap-2.5 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200"
      style={{
        backgroundColor: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.22)",
        color: "rgba(255,255,255,0.80)",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.16)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.45)";
        e.currentTarget.style.color = "rgba(255,255,255,1)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)";
        e.currentTarget.style.color = "rgba(255,255,255,0.80)";
      }}
    >
      <LogOut className="w-4 h-4" />
      SAIR
    </button>
  );
}

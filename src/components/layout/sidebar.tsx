"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types";
import { getInitials } from "@/lib/utils";
import { LayoutDashboard, Receipt, Settings, LogOut, House, TrendingUp, DollarSign, Activity, AreaChart, Briefcase, BookOpen, Target } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const EXPENSES_NAV = [
  { href: "/", label: "Início", icon: House, exact: true },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/expenses", label: "Despesas", icon: Receipt },
  { href: "/settings", label: "Configurações", icon: Settings },
];

const INVESTMENTS_NAV = [
  { href: "/", label: "Início", icon: House, exact: true },
  { href: "/investments/quotes", label: "Cotações", icon: DollarSign },
  { href: "/investments/charts", label: "Gráficos", icon: AreaChart },
  { href: "/investments/indicators", label: "Indicadores", icon: Activity },
  { href: "/investments/analyses", label: "Análises", icon: BookOpen },
  { href: "/investments/portfolio", label: "Carteira", icon: Briefcase },
  { href: "/investments/settings", label: "Configurações", icon: Settings },
];

const GOALS_NAV = [
  { href: "/", label: "Início", icon: House, exact: true },
  { href: "/goals", label: "Metas", icon: Target, exact: true },
];

// Accent color per module
const INVEST_COLOR = "#3b82f6";
const GOALS_COLOR = "#8b5cf6";
const EXPENSES_COLOR = "hsl(var(--primary))";

interface SidebarProps {
  profile: Profile | null;
}

export function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const isInvestments = pathname.startsWith("/investments");
  const isGoals = pathname.startsWith("/goals");
  const accentColor = isInvestments ? INVEST_COLOR : isGoals ? GOALS_COLOR : EXPENSES_COLOR;
  const accentBg = isInvestments ? "rgba(59,130,246,0.15)" : isGoals ? "rgba(139,92,246,0.15)" : "hsl(var(--primary))";

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="hidden lg:flex flex-col w-64 bg-sidebar-bg min-h-screen fixed left-0 top-0 z-20">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors duration-300"
            style={{ backgroundColor: accentColor }}
          >
            <span className="text-white font-bold text-lg">$</span>
          </div>
          <div>
            <span
              className="text-sidebar-fg font-semibold text-base leading-tight block transition-all duration-300"
              style={{ fontFamily: "Sora, sans-serif" }}
            >
              {isInvestments ? "Investimentos" : isGoals ? "Metas" : "Despesas"}
            </span>
            <span
              className="text-xs font-medium transition-colors duration-300"
              style={{ fontFamily: "Sora, sans-serif", color: accentColor }}
            >
              Familiares
            </span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {(isInvestments ? INVESTMENTS_NAV : isGoals ? GOALS_NAV : EXPENSES_NAV)
          .filter(item => item.href !== "/" || profile?.has_investments_access)
          .map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                active
                  ? "text-white shadow-sm"
                  : "text-slate-400 hover:text-sidebar-fg hover:bg-sidebar-muted"
              )}
              style={active ? { backgroundColor: accentColor } : undefined}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={profile?.avatar_url ?? undefined} />
            <AvatarFallback className="text-xs bg-sidebar-muted text-sidebar-fg">
              {profile?.name ? getInitials(profile.name) : "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sidebar-fg text-sm font-medium truncate">{profile?.name ?? "Usuário"}</p>
            <p className="text-slate-500 text-xs truncate">{profile?.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </aside>
  );
}

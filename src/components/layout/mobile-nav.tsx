"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { House, LayoutDashboard, Receipt, Settings, TrendingUp, PieChart, LineChart, ArrowLeftRight, Wallet, Users, Target, FileText, type LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavLeaf = { href: string; label: string; icon: LucideIcon; exact?: boolean };
type NavGroup = { label: string; icon: LucideIcon; children: NavLeaf[] };
type NavItem = NavLeaf | NavGroup;

const EXPENSES_NAV: NavItem[] = [
  { href: "/", label: "Início", icon: House, exact: true },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/expenses", label: "Despesas", icon: Receipt },
  { href: "/investments", label: "Invest.", icon: TrendingUp },
  { href: "/settings", label: "Config.", icon: Settings },
];

const INVESTMENTS_NAV: NavItem[] = [
  { href: "/", label: "Início", icon: House, exact: true },
  { href: "/investments", label: "Visão", icon: PieChart, exact: true }, // curto: a barra do celular tem 6 itens
  { href: "/investments/plano", label: "Plano", icon: LineChart },
  { href: "/investments/movimentacoes", label: "Movim.", icon: ArrowLeftRight },
  { href: "/investments/ir", label: "IR", icon: FileText },
  {
    label: "Config.", icon: Settings, children: [
      { href: "/investments/settings/carteira", label: "Carteira", icon: Wallet },
      { href: "/investments/settings/acessos", label: "Acessos", icon: Users },
    ],
  },
];

const GOALS_NAV = [
  { href: "/", label: "Início", icon: House, exact: true },
  { href: "/goals", label: "Metas", icon: Target, exact: true },
];

const INVEST_COLOR = "#3b82f6";
const GOALS_COLOR = "#8b5cf6";

export function MobileNav() {
  const pathname = usePathname();
  const isInvestments = pathname.startsWith("/investments");
  const isGoals = pathname.startsWith("/goals");

  const activeColor = isInvestments ? INVEST_COLOR : isGoals ? GOALS_COLOR : undefined;
  const nav = isInvestments ? INVESTMENTS_NAV : isGoals ? GOALS_NAV : EXPENSES_NAV;

  function isActive(href: string, exact?: boolean) {
    return exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-border shadow-lg">
      <div className="flex items-center justify-around px-2 py-2 safe-area-pb">
        {nav.map((item) => {
          if ("children" in item) {
            const active = item.children.some((c) => isActive(c.href));
            return (
              <DropdownMenu key={item.label}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex flex-col items-center gap-1 px-1.5 py-2 rounded-lg transition-all min-w-0 cursor-pointer",
                      active ? (activeColor ? "" : "text-primary") : "text-muted-foreground"
                    )}
                    style={active && activeColor ? { color: activeColor } : undefined}
                  >
                    <item.icon className={cn("h-5 w-5", active && "stroke-[2.5px]")} />
                    <span className="text-[10px] font-medium">{item.label}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="center">
                  {item.children.map((child) => (
                    <DropdownMenuItem key={child.href} asChild>
                      <Link href={child.href} className="flex items-center gap-2">
                        <child.icon className="h-4 w-4" />
                        {child.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          }

          const { href, label, icon: Icon, exact } = item;
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-1 px-1.5 py-2 rounded-lg transition-all min-w-0",
                active ? (activeColor ? "" : "text-primary") : "text-muted-foreground"
              )}
              style={active && activeColor ? { color: activeColor } : undefined}
            >
              <Icon className={cn("h-5 w-5", active && "stroke-[2.5px]")} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { House, LayoutDashboard, Receipt, Settings, TrendingUp } from "lucide-react";

const navItems = [
  { href: "/", label: "Início", icon: House, exact: true },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/expenses", label: "Despesas", icon: Receipt },
  { href: "/investments", label: "Invest.", icon: TrendingUp },
  { href: "/settings", label: "Config.", icon: Settings },
];

const INVEST_COLOR = "#3b82f6";

export function MobileNav() {
  const pathname = usePathname();
  const isInvestments = pathname.startsWith("/investments");

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-border shadow-lg">
      <div className="flex items-center justify-around px-2 py-2 safe-area-pb">
        {navItems.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
          const activeColor = isInvestments ? INVEST_COLOR : undefined;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all",
                active
                  ? isInvestments ? "" : "text-primary"
                  : "text-muted-foreground"
              )}
              style={active && isInvestments ? { color: activeColor } : undefined}
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

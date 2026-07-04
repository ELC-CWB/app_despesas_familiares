"use client";

import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { Expense, Profile, Category } from "@/types";
import { TrendingDown, Users, Tag, Calculator } from "lucide-react";
import { useMemo } from "react";

interface SummaryCardsProps {
  expenses: Expense[];
  members: Profile[];
  currentMonth: number;
  currentYear: number;
  categories: Category[];
}

export function SummaryCards({ expenses, members, currentMonth, currentYear, categories }: SummaryCardsProps) {
  const filtered = useMemo(
    () => expenses.filter((e) => e.payment_month === currentMonth && e.payment_year === currentYear),
    [expenses, currentMonth, currentYear]
  );

  const totalMonth = filtered.reduce((sum, e) => sum + Number(e.amount), 0);

  const avgPerUser = useMemo(() => {
    const totals = new Map<string, number>();
    filtered.forEach((e) => {
      totals.set(e.user_id, (totals.get(e.user_id) ?? 0) + Number(e.amount));
    });
    if (totals.size === 0) return 0;
    const sum = [...totals.values()].reduce((a, b) => a + b, 0);
    return sum / totals.size;
  }, [filtered]);

  const topCategory = useMemo(() => {
    const byCategory: Record<string, number> = {};
    filtered.forEach((e) => {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + Number(e.amount);
    });
    const top = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];
    return top ? { category: top[0], total: top[1] } : null;
  }, [filtered]);

  const topCategoryLabel = useMemo(() => {
    if (!topCategory) return "-";
    return categories.find((c) => c.id === topCategory.category)?.label ?? topCategory.category;
  }, [topCategory, categories]);

  const cards = [
    {
      title: "Total do Mês",
      value: formatCurrency(totalMonth),
      sub: `${filtered.length} lançamentos`,
      icon: TrendingDown,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      title: "Maior Categoria",
      value: topCategoryLabel,
      sub: topCategory ? formatCurrency(topCategory.total) : "Sem dados",
      icon: Tag,
      color: "text-purple-500",
      bg: "bg-purple-50",
    },
    {
      title: "Membros Ativos",
      value: members.length.toString(),
      sub: "no grupo",
      icon: Users,
      color: "text-blue-500",
      bg: "bg-blue-50",
    },
    {
      title: "Média por Usuário",
      value: avgPerUser > 0 ? formatCurrency(avgPerUser) : "-",
      sub: "no período selecionado",
      icon: Calculator,
      color: "text-orange-500",
      bg: "bg-orange-50",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-4">
      {cards.map((card, i) => (
        <Card key={card.title} className={`animate-fade-in-up-delay-${i + 1} hover:shadow-md transition-shadow`}>
          <CardContent className="p-3 lg:p-5">
            <div className="flex items-start justify-between mb-1.5 lg:mb-3">
              <p className="text-[11px] lg:text-sm text-muted-foreground font-medium leading-tight">{card.title}</p>
              <div className={`h-6 w-6 lg:h-8 lg:w-8 rounded-lg ${card.bg} flex items-center justify-center flex-shrink-0`}>
                <card.icon className={`h-3 w-3 lg:h-4 lg:w-4 ${card.color}`} />
              </div>
            </div>
            <p className="text-sm lg:text-xl font-bold text-foreground leading-tight break-all">{card.value}</p>
            <p className="text-[10px] lg:text-xs text-muted-foreground mt-0.5 lg:mt-1 truncate">{card.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

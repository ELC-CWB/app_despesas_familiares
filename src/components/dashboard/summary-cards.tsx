"use client";

import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { Expense, Profile, UserTotal } from "@/types";
import { EXPENSE_CATEGORIES } from "@/types";
import { TrendingDown, Users, Tag, Calendar } from "lucide-react";
import { useMemo } from "react";

interface SummaryCardsProps {
  expenses: Expense[];
  members: Profile[];
  currentMonth: number;
  currentYear: number;
}

export function SummaryCards({ expenses, members, currentMonth, currentYear }: SummaryCardsProps) {
  const filtered = useMemo(
    () => expenses.filter((e) => e.payment_month === currentMonth && e.payment_year === currentYear),
    [expenses, currentMonth, currentYear]
  );

  const totalMonth = filtered.reduce((sum, e) => sum + Number(e.amount), 0);
  const totalAll = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  const topCategory = useMemo(() => {
    const byCategory: Record<string, number> = {};
    filtered.forEach((e) => {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + Number(e.amount);
    });
    const top = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];
    return top ? { category: top[0], total: top[1] } : null;
  }, [filtered]);

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
      title: "Membros Ativos",
      value: members.length.toString(),
      sub: "no grupo",
      icon: Users,
      color: "text-blue-500",
      bg: "bg-blue-50",
    },
    {
      title: "Maior Categoria",
      value: topCategory ? EXPENSE_CATEGORIES[topCategory.category as keyof typeof EXPENSE_CATEGORIES]?.label ?? topCategory.category : "-",
      sub: topCategory ? formatCurrency(topCategory.total) : "Sem dados",
      icon: Tag,
      color: "text-purple-500",
      bg: "bg-purple-50",
    },
    {
      title: "Total Acumulado",
      value: formatCurrency(totalAll),
      sub: `${expenses.length} lançamentos`,
      icon: Calendar,
      color: "text-orange-500",
      bg: "bg-orange-50",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, i) => (
        <Card
          key={card.title}
          className={`animate-fade-in-up-delay-${i + 1} hover:shadow-md transition-shadow`}
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-3">
              <p className="text-sm text-muted-foreground font-medium">{card.title}</p>
              <div className={`h-8 w-8 rounded-lg ${card.bg} flex items-center justify-center flex-shrink-0`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </div>
            <p className="text-xl font-bold text-foreground leading-tight">{card.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

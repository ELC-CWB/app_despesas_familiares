"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { Expense } from "@/types";
import { ArrowUpCircle, ArrowDownCircle, Wallet } from "lucide-react";

interface BalanceCardsProps {
  // Listas já filtradas pela visão selecionada (Previsto ou Realizado)
  receitas: Expense[];
  despesas: Expense[];
  month: number;
  year: number;
  modo: "previsto" | "realizado";
}

export function BalanceCards({ receitas, despesas, month, year, modo }: BalanceCardsProps) {
  const t = useMemo(() => {
    const soma = (lista: Expense[]) =>
      lista
        .filter((e) => e.payment_month === month && e.payment_year === year)
        .reduce((s, e) => s + Number(e.amount), 0);
    const r = soma(receitas);
    const d = soma(despesas);
    return { r, d, saldo: r - d };
  }, [receitas, despesas, month, year]);

  const sufixo = modo === "previsto" ? "previstas" : "realizadas";
  const cards = [
    {
      title: "Receitas",
      value: formatCurrency(t.r),
      valueClass: "text-foreground",
      sub: `receitas ${sufixo} do mês`,
      icon: ArrowUpCircle,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      title: "Despesas",
      value: formatCurrency(t.d),
      valueClass: "text-foreground",
      sub: `despesas ${sufixo} do mês`,
      icon: ArrowDownCircle,
      color: "text-red-500",
      bg: "bg-red-50",
    },
    {
      title: "Saldo",
      value: formatCurrency(t.saldo),
      valueClass: t.saldo < 0 ? "text-red-600" : "text-foreground",
      sub: `saldo ${modo === "previsto" ? "previsto" : "realizado"} (receitas − despesas)`,
      icon: Wallet,
      color: "text-blue-500",
      bg: "bg-blue-50",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 lg:gap-4">
      {cards.map((card) => (
        <Card key={card.title} className="hover:shadow-md transition-shadow">
          <CardContent className="p-3 lg:p-5">
            <div className="flex items-start justify-between mb-1.5 lg:mb-3">
              <p className="text-[11px] lg:text-sm text-muted-foreground font-medium leading-tight">{card.title}</p>
              <div className={`h-6 w-6 lg:h-8 lg:w-8 rounded-lg ${card.bg} flex items-center justify-center flex-shrink-0`}>
                <card.icon className={`h-3 w-3 lg:h-4 lg:w-4 ${card.color}`} />
              </div>
            </div>
            <p className={`text-sm lg:text-xl font-bold leading-tight break-all ${card.valueClass}`}>{card.value}</p>
            <p className="text-[10px] lg:text-xs text-muted-foreground mt-0.5 lg:mt-1 leading-tight">{card.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { Expense } from "@/types";
import { ArrowUpCircle, Wallet, CalendarClock } from "lucide-react";

interface BalanceCardsProps {
  receitas: Expense[];
  despesas: Expense[];
  month: number;
  year: number;
}

function soma(lista: Expense[], status: "pago" | "previsto") {
  return lista
    .filter((e) => (e.status ?? "pago") === status)
    .reduce((s, e) => s + Number(e.amount), 0);
}

export function BalanceCards({ receitas, despesas, month, year }: BalanceCardsProps) {
  const t = useMemo(() => {
    const doMes = (e: Expense) => e.payment_month === month && e.payment_year === year;
    const r = receitas.filter(doMes);
    const d = despesas.filter(doMes);
    const recebida = soma(r, "pago");
    const receitaPrevista = soma(r, "previsto");
    const paga = soma(d, "pago");
    const despesaPrevista = soma(d, "previsto");
    return {
      receitaTotal: recebida + receitaPrevista,
      recebida,
      receitaPrevista,
      saldoRealizado: recebida - paga,
      saldoPrevisto: recebida + receitaPrevista - (paga + despesaPrevista),
    };
  }, [receitas, despesas, month, year]);

  const cor = (v: number) => (v < 0 ? "text-red-600" : "text-foreground");

  const cards = [
    {
      title: "Receitas do Mês",
      value: formatCurrency(t.receitaTotal),
      valueClass: "text-foreground",
      sub: `Recebido ${formatCurrency(t.recebida)} · Previsto ${formatCurrency(t.receitaPrevista)}`,
      icon: ArrowUpCircle,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      title: "Saldo Realizado",
      value: formatCurrency(t.saldoRealizado),
      valueClass: cor(t.saldoRealizado),
      sub: "recebido − pago",
      icon: Wallet,
      color: "text-blue-500",
      bg: "bg-blue-50",
    },
    {
      title: "Saldo Previsto",
      value: formatCurrency(t.saldoPrevisto),
      valueClass: cor(t.saldoPrevisto),
      sub: "receitas − despesas do mês",
      icon: CalendarClock,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 lg:gap-4">
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
            <p className="text-[10px] lg:text-xs text-muted-foreground mt-0.5 lg:mt-1">{card.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

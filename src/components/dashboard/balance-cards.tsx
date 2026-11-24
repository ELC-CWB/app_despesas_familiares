"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { Expense } from "@/types";
import { ArrowUpCircle, ArrowDownCircle, Wallet } from "lucide-react";

export type Modo = "ambos" | "previsto" | "realizado";

interface BalanceCardsProps {
  // Listas já filtradas pela visão selecionada (Previsto e/ou Realizado)
  receitas: Expense[];
  despesas: Expense[];
  month: number;
  year: number;
}

// No celular o "R$" some para o valor caber numa linha só; no desktop aparece normal
function Valor({ value }: { value: number }) {
  const numero = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(value));
  return (
    <>
      {value < 0 ? "-" : ""}
      <span className="hidden lg:inline">R$&nbsp;</span>
      {numero}
    </>
  );
}

export function BalanceCards({ receitas, despesas, month, year }: BalanceCardsProps) {
  const t = useMemo(() => {
    const soma = (lista: Expense[]) =>
      lista
        .filter((e) => e.payment_month === month && e.payment_year === year)
        .reduce((s, e) => s + Number(e.amount), 0);
    const r = soma(receitas);
    const d = soma(despesas);
    return { r, d, saldo: r - d };
  }, [receitas, despesas, month, year]);

  const cards = [
    { title: "Receitas", value: t.r, valueClass: "text-foreground", icon: ArrowUpCircle, color: "text-emerald-600", bg: "bg-emerald-50" },
    { title: "Despesas", value: t.d, valueClass: "text-foreground", icon: ArrowDownCircle, color: "text-red-500", bg: "bg-red-50" },
    { title: "Saldo", value: t.saldo, valueClass: t.saldo < 0 ? "text-red-600" : "text-foreground", icon: Wallet, color: "text-blue-500", bg: "bg-blue-50" },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 lg:gap-4 select-none">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardContent className="p-2.5 lg:p-5">
            <div className="flex items-center justify-between gap-1 mb-1.5 lg:mb-3">
              <p className="text-[11px] lg:text-sm text-muted-foreground font-medium leading-tight">{card.title}</p>
              <div className={`h-6 w-6 lg:h-8 lg:w-8 rounded-lg ${card.bg} flex items-center justify-center flex-shrink-0`}>
                <card.icon className={`h-3 w-3 lg:h-4 lg:w-4 ${card.color}`} />
              </div>
            </div>
            <p className={`text-[13px] lg:text-xl font-bold leading-tight whitespace-nowrap tabular-nums ${card.valueClass}`}>
              <Valor value={card.value} />
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

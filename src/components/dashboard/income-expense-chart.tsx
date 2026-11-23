"use client";

import { useMemo } from "react";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { Expense } from "@/types";
import { MONTHS } from "@/types";

interface IncomeExpenseChartProps {
  receitas: Expense[];
  despesas: Expense[];
  year: number;
}

// Receitas x despesas por mês (pagas/recebidas + previstas) e o saldo de cada mês
export function IncomeExpenseChart({ receitas, despesas, year }: IncomeExpenseChartProps) {
  const data = useMemo(() => {
    const total = (lista: Expense[], month: number) =>
      lista
        .filter((e) => e.payment_year === year && e.payment_month === month)
        .reduce((s, e) => s + Number(e.amount), 0);
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const r = total(receitas, month);
      const d = total(despesas, month);
      return { month: MONTHS[month].slice(0, 3), receitas: r, despesas: d, saldo: r - d };
    });
  }, [receitas, despesas, year]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Receitas x Despesas — {year}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => v === 0 ? "" : `R$${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              formatter={(value, name) => [formatCurrency(Number(value)), name]}
              contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", fontSize: "13px" }}
              cursor={{ fill: "hsl(var(--secondary))" }}
            />
            <Legend wrapperStyle={{ fontSize: "12px" }} />
            <Bar dataKey="receitas" name="Receitas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="despesas" name="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="saldo" name="Saldo" stroke="#10b981" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: "#10b981" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

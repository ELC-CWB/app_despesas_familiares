"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { Expense } from "@/types";
import { MONTHS } from "@/types";

interface MonthlyTrendChartProps {
  expenses: Expense[];
  year: number;
  modo?: "ambos" | "previsto" | "realizado";
}

export function MonthlyTrendChart({ expenses, year, modo = "ambos" }: MonthlyTrendChartProps) {
  const data = useMemo(() => {
    const filtered = expenses.filter((e) => e.payment_year === year);
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      let pago = 0;
      let previsto = 0;
      filtered
        .filter((e) => e.payment_month === month)
        .forEach((e) => {
          if (e.status === "previsto") previsto += Number(e.amount);
          else pago += Number(e.amount);
        });
      return { month: MONTHS[month].slice(0, 3), pago, previsto };
    });
  }, [expenses, year]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tendência Mensal — {year}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
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
            {modo !== "previsto" && <Bar dataKey="pago" name="Realizado" stackId="a" fill="#10b981" radius={modo === "realizado" ? [4, 4, 0, 0] : undefined} />}
            {modo !== "realizado" && <Bar dataKey="previsto" name="Previsto" stackId="a" fill="#fbbf24" radius={[4, 4, 0, 0]} />}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

"use client";

import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { Expense } from "@/types";
import { MONTHS } from "@/types";

interface MonthlyTrendChartProps {
  expenses: Expense[];
  year: number;
}

export function MonthlyTrendChart({ expenses, year }: MonthlyTrendChartProps) {
  const data = useMemo(() => {
    const filtered = expenses.filter((e) => e.payment_year === year);
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const total = filtered
        .filter((e) => e.payment_month === month)
        .reduce((sum, e) => sum + Number(e.amount), 0);
      return { month: MONTHS[month].slice(0, 3), total };
    });
  }, [expenses, year]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tendência Mensal — {year}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => v === 0 ? "" : `R$${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              formatter={(value) => [formatCurrency(Number(value)), "Total"]}
              contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", fontSize: "13px" }}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#totalGradient)"
              dot={{ fill: "#10b981", r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#10b981" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

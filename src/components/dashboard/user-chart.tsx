"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, getInitials } from "@/lib/utils";
import type { Expense, Profile } from "@/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4"];

interface UserChartProps {
  expenses: Expense[];
  members: Profile[];
  month: number;
  year: number;
}

export function UserChart({ expenses, members, month, year }: UserChartProps) {
  const data = useMemo(() => {
    const filtered = expenses.filter((e) => e.payment_month === month && e.payment_year === year);
    return members
      .map((m, i) => {
        const total = filtered
          .filter((e) => e.user_id === m.id)
          .reduce((sum, e) => sum + Number(e.amount), 0);
        return { name: m.name.split(" ")[0], fullName: m.name, total, color: COLORS[i % COLORS.length] };
      })
      .filter((d) => d.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [expenses, members, month, year]);

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gastos por Membro</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          Sem dados para este período
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Gastos por Membro</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              formatter={(value) => [formatCurrency(Number(value)), "Total"]}
              contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", fontSize: "13px" }}
              cursor={{ fill: "hsl(var(--secondary))" }}
            />
            <Bar dataKey="total" radius={[6, 6, 0, 0]} fill="#10b981" />
          </BarChart>
        </ResponsiveContainer>

        {/* Member list */}
        <div className="space-y-3 mt-4">
          {data.map((item) => (
            <div key={item.fullName} className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Avatar className="h-7 w-7">
                  <AvatarFallback
                    className="text-[10px] font-semibold text-white"
                    style={{ backgroundColor: item.color }}
                  >
                    {getInitials(item.fullName)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm text-foreground font-medium">{item.fullName}</span>
              </div>
              <span className="text-sm font-bold" style={{ color: item.color }}>
                {formatCurrency(item.total)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

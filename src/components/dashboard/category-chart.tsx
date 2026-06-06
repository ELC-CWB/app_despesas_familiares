"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { PieLabelRenderProps } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { Expense } from "@/types";
import { EXPENSE_CATEGORIES } from "@/types";

interface CategoryChartProps {
  expenses: Expense[];
  month: number;
  year: number;
}

const RADIAN = Math.PI / 180;

function renderCustomizedLabel(props: PieLabelRenderProps) {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props;
  if ((percent ?? 0) < 0.05) return null;
  const ir = Number(innerRadius ?? 0);
  const or = Number(outerRadius ?? 0);
  const ma = Number(midAngle ?? 0);
  const radius = ir + (or - ir) * 0.5;
  const x = Number(cx) + radius * Math.cos(-ma * RADIAN);
  const y = Number(cy) + radius * Math.sin(-ma * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${((percent ?? 0) * 100).toFixed(0)}%`}
    </text>
  );
}

export function CategoryChart({ expenses, month, year }: CategoryChartProps) {
  const data = useMemo(() => {
    const filtered = expenses.filter((e) => e.payment_month === month && e.payment_year === year);
    const byCategory: Record<string, number> = {};
    filtered.forEach((e) => {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + Number(e.amount);
    });
    return Object.entries(byCategory)
      .map(([key, value]) => ({
        name: EXPENSE_CATEGORIES[key as keyof typeof EXPENSE_CATEGORIES]?.label ?? key,
        value,
        color: EXPENSE_CATEGORIES[key as keyof typeof EXPENSE_CATEGORIES]?.color ?? "#6b7280",
        emoji: EXPENSE_CATEGORIES[key as keyof typeof EXPENSE_CATEGORIES]?.emoji ?? "📦",
      }))
      .sort((a, b) => b.value - a.value);
  }, [expenses, month, year]);

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Despesas por Categoria</CardTitle>
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
        <CardTitle className="text-base">Despesas por Categoria</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderCustomizedLabel}
              outerRadius={100}
              innerRadius={40}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => [formatCurrency(Number(value)), ""]}
              contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", fontSize: "13px" }}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="space-y-2 mt-2">
          {data.map((item) => (
            <div key={item.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-sm text-foreground">{item.emoji} {item.name}</span>
              </div>
              <span className="text-sm font-semibold text-foreground">{formatCurrency(item.value)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

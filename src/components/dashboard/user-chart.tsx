"use client";

import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Rectangle } from "recharts";
import type { BarShapeProps } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, getInitials } from "@/lib/utils";
import type { Expense, Profile } from "@/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4"];

interface UserChartProps {
  receitas: Expense[];
  despesas: Expense[];
  members: Profile[];
  month: number;
  year: number;
}

function renderBar(props: BarShapeProps) {
  return (
    <Rectangle
      x={props.x}
      y={props.y}
      width={props.width}
      height={props.height}
      radius={[6, 6, 0, 0]}
      fill={props.payload?.color ?? props.fill}
    />
  );
}

export function UserChart({ receitas, despesas, members, month, year }: UserChartProps) {
  const [visao, setVisao] = useState<"despesas" | "receitas">("despesas");
  const expenses = visao === "despesas" ? despesas : receitas;
  const titulo = visao === "despesas" ? "Despesas por Membro" : "Receitas por Membro";
  const seletor = (
    <Select value={visao} onValueChange={(v) => setVisao(v as "despesas" | "receitas")}>
      <SelectTrigger className="w-28 h-8 text-xs px-2.5 lg:w-32 lg:text-sm"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="despesas">Despesas</SelectItem>
        <SelectItem value="receitas">Receitas</SelectItem>
      </SelectContent>
    </Select>
  );
  const data = useMemo(() => {
    const filtered = expenses.filter((e) => e.payment_month === month && e.payment_year === year);
    return members
      .map((m, i) => {
        const color = COLORS[i % COLORS.length];
        const total = filtered
          .filter((e) => e.user_id === m.id)
          .reduce((sum, e) => sum + Number(e.amount), 0);
        return { name: m.name.split(" ")[0], fullName: m.name, total, color };
      })
      .filter((d) => d.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [expenses, members, month, year]);

  const avg = data.length > 1
    ? data.reduce((sum, d) => sum + d.total, 0) / data.length
    : null;

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">{titulo}</CardTitle>
        {seletor}
        </CardHeader>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          Sem dados para este período
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">{titulo}</CardTitle>
        {seletor}
      </CardHeader>
      <CardContent>
        <div style={{ WebkitTapHighlightColor: "transparent" }}>
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
              <Bar dataKey="total" shape={renderBar} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-3 mt-4">
          {data.map((item) => {
            const diff = avg !== null ? item.total - avg : null;
            return (
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
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-bold" style={{ color: item.color }}>
                    {formatCurrency(item.total)}
                  </span>
                  {diff !== null && (
                    <span className="text-xs font-medium" style={{ color: item.color }}>
                      ({diff >= 0 ? "+" : "-"}{formatCurrency(Math.abs(diff))})
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

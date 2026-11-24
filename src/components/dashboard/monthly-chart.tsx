"use client";

import { useMemo, useState } from "react";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import type { Expense } from "@/types";
import { MONTHS } from "@/types";
import type { Modo } from "@/components/dashboard/balance-cards";

type Visao = "ambos" | "despesas" | "receitas";

interface MonthlyChartProps {
  receitas: Expense[];
  despesas: Expense[];
  year: number;
  modo: Modo;
}

// Gráfico mensal único: despesas, receitas ou ambos (com o saldo de cada mês)
export function MonthlyChart({ receitas, despesas, year, modo }: MonthlyChartProps) {
  const [visao, setVisao] = useState<Visao>("ambos");

  const data = useMemo(() => {
    const soma = (lista: Expense[], month: number, previsto?: boolean) =>
      lista
        .filter((e) =>
          e.payment_year === year &&
          e.payment_month === month &&
          (previsto === undefined || (e.status === "previsto") === previsto)
        )
        .reduce((s, e) => s + Number(e.amount), 0);
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const r = soma(receitas, month);
      const d = soma(despesas, month);
      return {
        month: MONTHS[month].slice(0, 3),
        receitas: r,
        despesas: d,
        saldo: r - d,
        realizadoDesp: soma(despesas, month, false),
        previstoDesp: soma(despesas, month, true),
        realizadoRec: soma(receitas, month, false),
        previstoRec: soma(receitas, month, true),
      };
    });
  }, [receitas, despesas, year]);

  const mostraRealizado = modo !== "previsto";
  const mostraPrevisto = modo !== "realizado";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Evolução Mensal — {year}</CardTitle>
        <Select value={visao} onValueChange={(v) => setVisao(v as Visao)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ambos">Receitas e Despesas</SelectItem>
            <SelectItem value="despesas">Somente Despesas</SelectItem>
            <SelectItem value="receitas">Somente Receitas</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
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
            {visao === "ambos" && (
              <>
                <Bar dataKey="receitas" name="Receitas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesas" name="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="saldo" name="Saldo" stroke="#10b981" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: "#10b981" }} />
              </>
            )}
            {visao === "despesas" && (
              <>
                {mostraRealizado && <Bar dataKey="realizadoDesp" name="Realizado" stackId="a" fill="#10b981" radius={!mostraPrevisto ? [4, 4, 0, 0] : undefined} />}
                {mostraPrevisto && <Bar dataKey="previstoDesp" name="Previsto" stackId="a" fill="#fbbf24" radius={[4, 4, 0, 0]} />}
              </>
            )}
            {visao === "receitas" && (
              <>
                {mostraRealizado && <Bar dataKey="realizadoRec" name="Realizado" stackId="a" fill="#3b82f6" radius={!mostraPrevisto ? [4, 4, 0, 0] : undefined} />}
                {mostraPrevisto && <Bar dataKey="previstoRec" name="Previsto" stackId="a" fill="#fbbf24" radius={[4, 4, 0, 0]} />}
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

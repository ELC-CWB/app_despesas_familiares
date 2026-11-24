"use client";

import { useState, useMemo } from "react";
import { MONTHS } from "@/types";
import type { Expense, Profile, Category } from "@/types";
import { Header } from "@/components/layout/header";
import { CategoryChart } from "@/components/dashboard/category-chart";
import { UserChart } from "@/components/dashboard/user-chart";
import { MonthlyTrendChart } from "@/components/dashboard/monthly-trend-chart";
import type { Modo } from "@/components/dashboard/balance-cards";
import { BalanceCards } from "@/components/dashboard/balance-cards";
import { IncomeExpenseChart } from "@/components/dashboard/income-expense-chart";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface DashboardClientProps {
  expenses: Expense[];
  members: Profile[];
  categories: Category[];
  profile: Profile | null;
  groupName: string | null;
}

export function DashboardClient({ expenses: allExpenses, members, categories, profile, groupName }: DashboardClientProps) {
  const now = new Date();
  // Ambos = tudo que está lançado; Previsto = só o ainda não pago/recebido; Realizado = só o já pago/recebido
  const [verPrevisto, setVerPrevisto] = useState(true);
  const [verRealizado, setVerRealizado] = useState(true);
  const modo: Modo = verPrevisto && !verRealizado ? "previsto" : verRealizado && !verPrevisto ? "realizado" : "ambos";
  const visiveis = useMemo(
    () => allExpenses.filter((e) => ((e.status ?? "pago") === "pago") ? verRealizado : verPrevisto),
    [allExpenses, verPrevisto, verRealizado]
  );
  // Lançamentos do grupo: despesas e receitas (registros antigos sem tipo = despesa)
  const expenses = useMemo(() => visiveis.filter((e) => (e.type ?? "despesa") === "despesa"), [visiveis]);
  const receitas = useMemo(() => visiveis.filter((e) => e.type === "receita"), [visiveis]);
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const currentYear = now.getFullYear();
  const years = [...new Set([
    ...allExpenses.map((e) => e.payment_year),
    currentYear,
  ])].sort((a, b) => b - a);

  return (
    <>
      <Header
        title="Dashboard"
        subtitle={`${MONTHS[selectedMonth]} ${selectedYear}`}
        profile={profile}
        groupName={groupName}
        displayMonth={selectedMonth}
        displayYear={selectedYear}
      />
      <div className="p-5 lg:p-8 space-y-6">
        <div className="flex flex-wrap gap-3">
          <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(MONTHS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-4 h-9 px-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={verPrevisto} onChange={(e) => setVerPrevisto(e.target.checked)} className="h-4 w-4 accent-amber-500" />
              Previsto
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={verRealizado} onChange={(e) => setVerRealizado(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
              Realizado
            </label>
          </div>
        </div>

        <BalanceCards receitas={receitas} despesas={expenses} month={selectedMonth} year={selectedYear} modo={modo} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CategoryChart expenses={expenses} month={selectedMonth} year={selectedYear} categories={categories} />
          <UserChart expenses={expenses} members={members} month={selectedMonth} year={selectedYear} />
        </div>

        <MonthlyTrendChart expenses={expenses} year={selectedYear} modo={modo} />

        {allExpenses.some((e) => e.type === "receita") && (
          <IncomeExpenseChart receitas={receitas} despesas={expenses} year={selectedYear} />
        )}
      </div>
    </>
  );
}

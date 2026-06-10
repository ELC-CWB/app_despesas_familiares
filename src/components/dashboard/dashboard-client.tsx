"use client";

import { useState } from "react";
import { MONTHS } from "@/types";
import type { Expense, Profile, Category } from "@/types";
import { Header } from "@/components/layout/header";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { CategoryChart } from "@/components/dashboard/category-chart";
import { UserChart } from "@/components/dashboard/user-chart";
import { MonthlyTrendChart } from "@/components/dashboard/monthly-trend-chart";
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

export function DashboardClient({ expenses, members, categories, profile, groupName }: DashboardClientProps) {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const currentYear = now.getFullYear();
  const years = [...new Set([
    ...expenses.map((e) => e.payment_year),
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
        <div className="flex gap-3">
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
        </div>

        <SummaryCards
          expenses={expenses}
          members={members}
          currentMonth={selectedMonth}
          currentYear={selectedYear}
          categories={categories}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CategoryChart expenses={expenses} month={selectedMonth} year={selectedYear} categories={categories} />
          <UserChart expenses={expenses} members={members} month={selectedMonth} year={selectedYear} />
        </div>

        <MonthlyTrendChart expenses={expenses} year={selectedYear} />
      </div>
    </>
  );
}

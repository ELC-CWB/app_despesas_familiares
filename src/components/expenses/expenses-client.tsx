"use client";

import { useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Expense, Profile, Category } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { ExpenseFilters } from "./expense-filters";
import { ExpenseTable } from "./expense-table";
import { ExpenseModal } from "./expense-modal";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus } from "lucide-react";

interface ExpensesClientProps {
  initialExpenses: Expense[];
  members: Profile[];
  currentUserId: string;
  groupId: string;
  categories: Category[];
  profile: Profile | null;
  groupName: string | null;
}

export function ExpensesClient({ initialExpenses, members, currentUserId, groupId, categories, profile, groupName }: ExpensesClientProps) {
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const now = new Date();
  const [filters, setFilters] = useState({
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
    category: "",
    user_id: "",
    search: "",
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("expenses")
      .select("*, profiles(id, name, email, avatar_url)")
      .eq("group_id", groupId)
      .order("date", { ascending: false });
    setExpenses(data ?? []);
    setLoading(false);
  }, [groupId]);

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (filters.month && filters.month !== "all" && String(e.payment_month) !== filters.month) return false;
      if (filters.year && String(e.payment_year) !== filters.year) return false;
      if (filters.category && filters.category !== "all" && e.category !== filters.category) return false;
      if (filters.user_id && filters.user_id !== "all" && e.user_id !== filters.user_id) return false;
      if (filters.search && !e.description.toLowerCase().includes(filters.search.toLowerCase())) return false;
      return true;
    });
  }, [expenses, filters]);

  const total = useMemo(
    () => filtered.reduce((sum, e) => sum + Number(e.amount), 0),
    [filtered]
  );

  return (
    <>
      <Header
        title="Despesas"
        subtitle="Todos os lançamentos do grupo"
        profile={profile}
        groupName={groupName}
        displayMonth={Number(filters.month)}
        displayYear={Number(filters.year)}
      />
      <div className="p-5 lg:p-8 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {filtered.length} despesa{filtered.length !== 1 ? "s" : ""} ·{" "}
            <span className="font-semibold text-foreground">{formatCurrency(total)}</span>
          </p>
        </div>
        <Button onClick={() => setShowModal(true)} className="gap-2 flex-shrink-0">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nova despesa</span>
          <span className="sm:hidden">Novo</span>
        </Button>
      </div>

      <ExpenseFilters
        filters={filters}
        onChange={setFilters}
        members={members}
        currentUserId={currentUserId}
        categories={categories}
      />

      <Card>
        <CardContent className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              Carregando...
            </div>
          ) : (
            <ExpenseTable
              expenses={filtered}
              currentUserId={currentUserId}
              groupId={groupId}
              onRefresh={refresh}
              categories={categories}
            />
          )}
        </CardContent>
      </Card>

      <ExpenseModal
        open={showModal}
        onOpenChange={setShowModal}
        groupId={groupId}
        userId={currentUserId}
        onSuccess={refresh}
        categories={categories}
      />
    </div>
    </>
  );
}

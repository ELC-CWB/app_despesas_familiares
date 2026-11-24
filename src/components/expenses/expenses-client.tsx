"use client";

import { useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Expense, Profile, Category, ExpenseType } from "@/types";
import { TIPO_TEXTOS } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { ExpenseFilters } from "./expense-filters";
import { ExpenseTable } from "./expense-table";
import { ExpenseModal } from "./expense-modal";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus } from "lucide-react";

interface ExpensesClientProps {
  tipo: ExpenseType;
  initialExpenses: Expense[];
  members: Profile[];
  currentUserId: string;
  groupId: string;
  categories: Category[];
  profile: Profile | null;
  groupName: string | null;
}

export function ExpensesClient({ tipo, initialExpenses, members, currentUserId, groupId, categories, profile, groupName }: ExpensesClientProps) {
  const textos = TIPO_TEXTOS[tipo];
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
    amount: "",
    previsto: true,
    realizado: true,
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("expenses")
      .select("*, profiles(id, name, email, avatar_url)")
      .eq("group_id", groupId)
      .eq("type", tipo)
      .order("date", { ascending: false });
    setExpenses(data ?? []);
    setLoading(false);
  }, [groupId, tipo]);

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (filters.month && filters.month !== "all" && String(e.payment_month) !== filters.month) return false;
      if (filters.year && String(e.payment_year) !== filters.year) return false;
      if (filters.category && filters.category !== "all" && e.category !== filters.category) return false;
      if (filters.user_id && filters.user_id !== "all" && e.user_id !== filters.user_id) return false;
      if (((e.status ?? "pago") === "pago") ? !filters.realizado : !filters.previsto) return false;
      if (filters.search &&!e.description.toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.amount && !Number(e.amount).toString().includes(filters.amount.replace(",", "."))) return false;
      return true;
    });
  }, [expenses, filters]);

  const { total, totalPago, totalPrevisto } = useMemo(() => {
    let pago = 0;
    let previsto = 0;
    filtered.forEach((e) => {
      if (e.status === "previsto") previsto += Number(e.amount);
      else pago += Number(e.amount);
    });
    return { total: pago + previsto, totalPago: pago, totalPrevisto: previsto };
  }, [filtered]);

  return (
    <>
      <Header
        title={textos.titulo}
        subtitle="Todos os lançamentos do grupo"
        profile={profile}
        groupName={groupName}
        displayMonth={Number(filters.month)}
        displayYear={Number(filters.year)}
      />
      <div className="p-3 lg:p-8 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {filtered.length} {filtered.length !== 1 ? textos.plural : textos.singular} ·{" "}
            <span className="font-semibold text-foreground">{formatCurrency(total)}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            <span className="text-emerald-600 font-medium">{tipo === "receita" ? "Recebido" : "Pago"} {formatCurrency(totalPago)}</span>
            {" · "}
            <span className="text-amber-600 font-medium">Previsto {formatCurrency(totalPrevisto)}</span>
          </p>
        </div>
        <Button onClick={() => setShowModal(true)} className="gap-2 flex-shrink-0">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{textos.novo}</span>
          <span className="sm:hidden">Novo</span>
        </Button>
      </div>

      <ExpenseFilters
        filters={filters}
        onChange={setFilters}
        members={members}
        currentUserId={currentUserId}
        categories={categories}
        tipo={tipo}
      />

      <Card>
        <CardContent className="p-2 sm:p-5">
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
              tipo={tipo}
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
        tipo={tipo}
      />
    </div>
    </>
  );
}

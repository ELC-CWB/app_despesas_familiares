"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Expense, Category } from "@/types";
import { PAYMENT_METHODS } from "@/types";
import { formatCurrency, formatDate, getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { ExpenseModal } from "./expense-modal";

const USER_COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4"];

interface ExpenseTableProps {
  expenses: Expense[];
  currentUserId: string;
  groupId: string;
  onRefresh: () => void;
  categories: Category[];
}

function getCat(categoryId: string, categories: Category[]) {
  return categories.find((c) => c.id === categoryId) ?? { label: categoryId, emoji: "📦", color: "#6b7280" };
}

export function ExpenseTable({ expenses, currentUserId, groupId, onRefresh, categories }: ExpenseTableProps) {
  const { toast } = useToast();
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [deleteExpense, setDeleteExpense] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const userColorMap = new Map<string, string>();
  expenses.forEach((e) => {
    if (!userColorMap.has(e.user_id)) {
      userColorMap.set(e.user_id, USER_COLORS[userColorMap.size % USER_COLORS.length]);
    }
  });

  async function handleDelete() {
    if (!deleteExpense) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from("expenses").delete().eq("id", deleteExpense.id);
    setDeleting(false);
    if (error) {
      toast({ variant: "destructive", title: "Erro ao excluir", description: error.message });
      return;
    }
    toast({ title: "Despesa excluída" });
    setDeleteExpense(null);
    onRefresh();
  }

  if (expenses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-4xl mb-3">💸</div>
        <p className="text-foreground font-medium">Nenhuma despesa encontrada</p>
        <p className="text-muted-foreground text-sm mt-1">Adicione uma despesa ou ajuste os filtros</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-semibold text-muted-foreground pb-3 px-2">Pagador</th>
              <th className="text-left text-xs font-semibold text-muted-foreground pb-3 px-2">Data</th>
              <th className="text-left text-xs font-semibold text-muted-foreground pb-3 px-2">Descrição</th>
              <th className="text-left text-xs font-semibold text-muted-foreground pb-3 px-2">Categoria</th>
              <th className="text-left text-xs font-semibold text-muted-foreground pb-3 px-2">Pagamento</th>
              <th className="text-right text-xs font-semibold text-muted-foreground pb-3 px-2">Valor</th>
              <th className="pb-3 px-2 w-16" />
            </tr>
          </thead>
          <tbody>
            {expenses.map((expense) => {
              const category = getCat(expense.category, categories);
              const color = userColorMap.get(expense.user_id) ?? "#6b7280";
              const isOwn = expense.user_id === currentUserId;
              const name = expense.profiles?.name ?? "?";

              return (
                <tr
                  key={expense.id}
                  className="border-b border-border/50 hover:bg-secondary/40 transition-colors"
                >
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-[10px] font-semibold text-white" style={{ backgroundColor: color }}>
                          {getInitials(name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{name.split(" ")[0]}</span>
                    </div>
                  </td>
                  <td className="py-3 px-2 text-sm text-muted-foreground">{formatDate(expense.date)}</td>
                  <td className="py-3 px-2">
                    <span className="text-sm font-medium">{expense.description}</span>
                  </td>
                  <td className="py-3 px-2">
                    <Badge
                      variant="secondary"
                      className="text-xs gap-1 font-medium"
                      style={{
                        backgroundColor: category.color + "18",
                        color: category.color,
                        borderColor: category.color + "30",
                      }}
                    >
                      {category.emoji} {category.label}
                    </Badge>
                  </td>
                  <td className="py-3 px-2 text-sm text-muted-foreground">
                    {PAYMENT_METHODS[expense.payment_method] ?? expense.payment_method}
                  </td>
                  <td className="py-3 px-2 text-right font-bold text-foreground">
                    {formatCurrency(Number(expense.amount))}
                  </td>
                  <td className="py-3 px-2">
                    {isOwn && (
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          onClick={() => setEditExpense(expense)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteExpense(expense)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {expenses.map((expense) => {
          const category = getCat(expense.category, categories);
          const color = userColorMap.get(expense.user_id) ?? "#6b7280";
          const isOwn = expense.user_id === currentUserId;
          const name = expense.profiles?.name ?? "?";

          return (
            <div
              key={expense.id}
              className="border border-border rounded-xl p-4 bg-card"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarFallback className="text-xs font-semibold text-white" style={{ backgroundColor: color }}>
                      {getInitials(name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{expense.description}</p>
                    <p className="text-xs text-muted-foreground">{name.split(" ")[0]} · {formatDate(expense.date)}</p>
                  </div>
                </div>
                <p className="font-bold text-foreground flex-shrink-0">{formatCurrency(Number(expense.amount))}</p>
              </div>
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="secondary"
                    className="text-xs gap-1"
                    style={{
                      backgroundColor: category.color + "18",
                      color: category.color,
                    }}
                  >
                    {category.emoji} {category.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {PAYMENT_METHODS[expense.payment_method] ?? expense.payment_method}
                  </span>
                </div>
                {isOwn && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditExpense(expense)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70" onClick={() => setDeleteExpense(expense)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit modal */}
      {editExpense && (
        <ExpenseModal
          open={!!editExpense}
          onOpenChange={(o) => { if (!o) setEditExpense(null); }}
          expense={editExpense}
          groupId={groupId}
          userId={currentUserId}
          onSuccess={() => { setEditExpense(null); onRefresh(); }}
          categories={categories}
        />
      )}

      {/* Delete confirmation */}
      <Dialog open={!!deleteExpense} onOpenChange={(o) => { if (!o) setDeleteExpense(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir despesa?</DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. A despesa "<strong>{deleteExpense?.description}</strong>" será removida permanentemente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteExpense(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

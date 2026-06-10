"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Expense, PaymentMethod, Category } from "@/types";
import { PAYMENT_METHODS, MONTHS } from "@/types";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface ExpenseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: Expense | null;
  groupId: string;
  userId: string;
  onSuccess: () => void;
  categories: Category[];
}

const METHODS = Object.entries(PAYMENT_METHODS) as [PaymentMethod, string][];

function getDefaultMonth() { return new Date().getMonth() + 1; }
function getDefaultYear() { return new Date().getFullYear(); }
function todayISO() { return new Date().toISOString().split("T")[0]; }

export function ExpenseModal({ open, onOpenChange, expense, groupId, userId, onSuccess, categories }: ExpenseModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    date: todayISO(),
    payment_month: getDefaultMonth(),
    payment_year: getDefaultYear(),
    payment_method: "pix" as PaymentMethod,
    description: "",
    category: "",
    amount: "",
  });

  useEffect(() => {
    if (expense) {
      setForm({
        date: expense.date,
        payment_month: expense.payment_month,
        payment_year: expense.payment_year,
        payment_method: expense.payment_method,
        description: expense.description,
        category: expense.category,
        amount: String(expense.amount),
      });
    } else {
      setForm({
        date: todayISO(),
        payment_month: getDefaultMonth(),
        payment_year: getDefaultYear(),
        payment_method: "pix",
        description: "",
        category: categories[0]?.id ?? "",
        amount: "",
      });
    }
  }, [expense, open, categories]);

  const handleSubmit = useCallback(async (e: { preventDefault(): void }) => {
    e.preventDefault();

    const amount = parseFloat(form.amount.replace(",", "."));
    if (isNaN(amount) || amount <= 0) {
      toast({ variant: "destructive", title: "Valor inválido", description: "Informe um valor maior que zero." });
      return;
    }
    if (!form.category) {
      toast({ variant: "destructive", title: "Categoria obrigatória", description: "Selecione uma categoria." });
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const payload = {
      date: form.date,
      payment_month: form.payment_month,
      payment_year: form.payment_year,
      payment_method: form.payment_method,
      description: form.description.trim(),
      category: form.category,
      amount,
      group_id: groupId,
      user_id: userId,
    };

    let error: string | null = null;

    if (expense) {
      const { error: err } = await supabase
        .from("expenses")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", expense.id);
      error = err?.message ?? null;
    } else {
      const { error: err } = await supabase.from("expenses").insert(payload);
      error = err?.message ?? null;
    }

    setLoading(false);

    if (error) {
      toast({ variant: "destructive", title: "Erro ao salvar", description: error });
      return;
    }

    toast({
      title: expense ? "Despesa atualizada!" : "Despesa adicionada!",
      description: `${form.description} — R$ ${amount.toFixed(2).replace(".", ",")}`,
    });
    onOpenChange(false);
    onSuccess();
  }, [form, expense, groupId, userId, onOpenChange, onSuccess, toast]);

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "Sora, sans-serif" }}>
            {expense ? "Editar Despesa" : "Nova Despesa"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-date">Data da despesa</Label>
              <Input
                id="exp-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mês de competência</Label>
              <Select
                value={String(form.payment_month)}
                onValueChange={(v) => setForm({ ...form, payment_month: parseInt(v) as typeof form.payment_month })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MONTHS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Ano</Label>
            <Select
              value={String(form.payment_year)}
              onValueChange={(v) => setForm({ ...form, payment_year: parseInt(v) })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exp-desc">Descrição</Label>
            <Input
              id="exp-desc"
              placeholder="Ex: Supermercado, Conta de luz..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exp-amount">Valor (R$)</Label>
            <Input
              id="exp-amount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0,00"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <span className="flex items-center gap-2">
                      <span>{cat.emoji}</span>
                      <span>{cat.label}</span>
                    </span>
                  </SelectItem>
                ))}
                {categories.length === 0 && (
                  <SelectItem value="" disabled>Nenhuma categoria cadastrada</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Forma de pagamento</Label>
            <Select
              value={form.payment_method}
              onValueChange={(v) => setForm({ ...form, payment_method: v as PaymentMethod })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {METHODS.map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="pt-2 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? "Salvando..." : expense ? "Atualizar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

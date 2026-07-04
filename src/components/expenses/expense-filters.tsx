"use client";

import { MONTHS, type Profile, type Category } from "@/types";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Search } from "lucide-react";

interface Filters {
  month: string;
  year: string;
  category: string;
  user_id: string;
  search: string;
  amount: string;
  amountOp: "<=" | ">=" | "=";
}

interface ExpenseFiltersProps {
  filters: Filters;
  onChange: (f: Filters) => void;
  members: Profile[];
  currentUserId: string;
  categories: Category[];
}

export function ExpenseFilters({ filters, onChange, members, currentUserId, categories }: ExpenseFiltersProps) {
  const hasFilters = filters.month || filters.category || filters.user_id || filters.search || filters.amount;

  function reset() {
    const now = new Date();
    onChange({ month: String(now.getMonth() + 1), year: String(now.getFullYear()), category: "", user_id: "", search: "", amount: "", amountOp: "<=" });
  }

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por descrição..."
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            className="pl-9"
          />
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden flex-shrink-0">
          <select
            value={filters.amountOp}
            onChange={(e) => onChange({ ...filters, amountOp: e.target.value as Filters["amountOp"] })}
            className="bg-background text-xs font-semibold text-muted-foreground px-2 border-r border-border focus:outline-none"
          >
            <option value="<=">Até</option>
            <option value=">=">A partir de</option>
            <option value="=">Igual a</option>
          </select>
          <Input
            type="number"
            placeholder="R$ valor"
            value={filters.amount}
            onChange={(e) => onChange({ ...filters, amount: e.target.value })}
            className="w-28 border-0 rounded-none focus-visible:ring-0"
            min="0"
            step="0.01"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Select value={filters.month} onValueChange={(v) => onChange({ ...filters, month: v })}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Mês" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os meses</SelectItem>
            {Object.entries(MONTHS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.year} onValueChange={(v) => onChange({ ...filters, year: v })}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Ano" /></SelectTrigger>
          <SelectContent>
            {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filters.category} onValueChange={(v) => onChange({ ...filters, category: v })}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>{cat.emoji} {cat.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.user_id} onValueChange={(v) => onChange({ ...filters, user_id: v })}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Membro" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name.split(" ")[0]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasFilters && (
        <div className="flex">
          <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground gap-1.5">
            <X className="h-3.5 w-3.5" />
            Limpar
          </Button>
        </div>
      )}
    </div>
  );
}

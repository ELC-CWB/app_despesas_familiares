"use client";

import { EXPENSE_CATEGORIES, MONTHS, type ExpenseCategory, type Profile } from "@/types";
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
}

interface ExpenseFiltersProps {
  filters: Filters;
  onChange: (f: Filters) => void;
  members: Profile[];
  currentUserId: string;
}

export function ExpenseFilters({ filters, onChange, members, currentUserId }: ExpenseFiltersProps) {
  const hasFilters =
    filters.month || filters.category || filters.user_id || filters.search;

  function reset() {
    const now = new Date();
    onChange({ month: String(now.getMonth() + 1), year: String(now.getFullYear()), category: "", user_id: "", search: "" });
  }

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por descrição..."
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={filters.month} onValueChange={(v) => onChange({ ...filters, month: v })}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os meses</SelectItem>
            {Object.entries(MONTHS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.year} onValueChange={(v) => onChange({ ...filters, year: v })}>
          <SelectTrigger className="w-28">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.category} onValueChange={(v) => onChange({ ...filters, category: v })}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {Object.entries(EXPENSE_CATEGORIES).map(([key, { label, emoji }]) => (
              <SelectItem key={key} value={key}>{emoji} {label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.user_id} onValueChange={(v) => onChange({ ...filters, user_id: v })}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Membro" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.id === currentUserId ? "Eu" : m.name.split(" ")[0]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground gap-1.5">
            <X className="h-3.5 w-3.5" />
            Limpar
          </Button>
        )}
      </div>
    </div>
  );
}

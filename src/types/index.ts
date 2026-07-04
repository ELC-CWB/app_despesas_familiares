export type PaymentMethod = "dinheiro" | "debito" | "pix" | "cartao_credito";

export type ExpenseCategory = string;

export type PaymentMonth =
  | 1 | 2 | 3 | 4 | 5 | 6
  | 7 | 8 | 9 | 10 | 11 | 12;

export interface Profile {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  group_id: string | null;
  investment_group_id: string | null;
  has_investments_access: boolean;
  created_at: string;
}

export interface InvestmentGroup {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export interface Category {
  id: string;
  group_id: string;
  label: string;
  emoji: string;
  color: string;
  position: number;
  created_at: string;
}

export interface GroupInvite {
  id: string;
  group_id: string;
  invited_email: string;
  invited_by: string;
  accepted: boolean;
  created_at: string;
  groups?: Group;
  profiles?: Profile;
}

export interface Expense {
  id: string;
  user_id: string;
  group_id: string;
  date: string;
  payment_month: PaymentMonth;
  payment_year: number;
  payment_method: PaymentMethod;
  description: string;
  category: string;
  amount: number;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
}

export interface ExpenseFilters {
  month?: number;
  year?: number;
  category?: string;
  user_id?: string | "";
  search?: string;
}

export interface CategoryTotal {
  category: string;
  total: number;
}

export interface UserTotal {
  user_id: string;
  name: string;
  total: number;
}

export const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  debito: "Débito Automático",
  pix: "Pix",
  cartao_credito: "Cartão de Crédito",
};

export const MONTHS: Record<number, string> = {
  1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril",
  5: "Maio", 6: "Junho", 7: "Julho", 8: "Agosto",
  9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro",
};

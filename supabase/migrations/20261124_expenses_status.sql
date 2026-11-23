-- Status da despesa: paga ou prevista (ainda não paga).
-- Despesas já lançadas ficam como 'pago'.
alter table public.expenses
  add column if not exists status text not null default 'pago'
  check (status in ('pago', 'previsto'));

-- Investment Operations (portfolio tracking)
-- Run this in Supabase SQL Editor

create table if not exists public.investment_operations (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  symbol         text not null,
  company_name   text,
  operation_date date not null,
  quantity       numeric(14, 4) not null check (quantity > 0),
  price          numeric(14, 4) not null check (price > 0),
  total          numeric(14, 2) not null check (total > 0),
  operation_type text not null check (operation_type in ('BUY', 'SELL')),
  notes          text,
  created_at     timestamptz default now()
);

create index if not exists inv_operations_profile_id_idx on public.investment_operations(profile_id);
create index if not exists inv_operations_symbol_idx     on public.investment_operations(profile_id, symbol);

alter table public.investment_operations enable row level security;

create policy "InvOperations: own"
  on public.investment_operations for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

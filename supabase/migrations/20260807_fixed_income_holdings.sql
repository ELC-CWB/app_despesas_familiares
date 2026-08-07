-- Fixed Income Holdings (Renda Fixa: one row per application, not a buy/sell ledger)
-- Run this in Supabase SQL Editor

create table if not exists public.fixed_income_holdings (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  tipo              text not null check (tipo in
                       ('CDB','LCI','LCA','TESOURO_SELIC','TESOURO_IPCA',
                        'TESOURO_PREFIXADO','DEBENTURE','CRI','CRA','OUTRO')),
  institution       text,
  indexador         text not null check (indexador in ('CDI','SELIC','IPCA','PREFIXADO')),
  taxa              numeric(8, 4) not null check (taxa >= 0),
  principal         numeric(14, 2) not null check (principal > 0),
  application_date  date not null,
  maturity_date     date not null,
  notes             text,
  created_at        timestamptz default now(),
  check (maturity_date >= application_date)
);

create index if not exists fi_holdings_profile_id_idx on public.fixed_income_holdings(profile_id);
create index if not exists fi_holdings_app_date_idx    on public.fixed_income_holdings(profile_id, application_date);

alter table public.fixed_income_holdings enable row level security;

create policy "FixedIncomeHoldings: own"
  on public.fixed_income_holdings for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "FixedIncomeHoldings: group members view admin"
  on public.fixed_income_holdings for select
  using (
    profile_id = (
      select ig.created_by
      from public.investment_groups ig
      where ig.id = public.get_my_investment_group_id()
    )
  );

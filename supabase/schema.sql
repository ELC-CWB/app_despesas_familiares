


-- ============================================================
-- Despesas Familiares — Supabase Schema
-- Run this in the Supabase SQL editor (Dashboard > SQL Editor)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

-- Groups
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz default now()
);

-- Profiles (one per auth user)
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '',
  email       text not null default '',
  avatar_url  text,
  group_id    uuid references public.groups(id) on delete set null,
  created_at  timestamptz default now()
);

-- Group invites
create table if not exists public.group_invites (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.groups(id) on delete cascade,
  invited_email  text not null,
  invited_by     uuid references auth.users(id) on delete set null,
  accepted       boolean not null default false,
  created_at     timestamptz default now()
);

-- Expenses
create table if not exists public.expenses (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  group_id        uuid not null references public.groups(id) on delete cascade,
  date            date not null,
  payment_month   smallint not null check (payment_month between 1 and 12),
  payment_year    smallint not null check (payment_year between 2000 and 2100),
  payment_method  text not null check (payment_method in ('dinheiro','debito','pix','cartao_credito')),
  description     text not null,
  category        text not null check (category in ('moradia','alimentacao','saude','educacao','lazer','transporte','outros')),
  amount          numeric(10,2) not null check (amount > 0),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists expenses_group_id_idx       on public.expenses(group_id);
create index if not exists expenses_user_id_idx        on public.expenses(user_id);
create index if not exists expenses_payment_month_idx  on public.expenses(payment_month, payment_year);
create index if not exists group_invites_email_idx     on public.group_invites(invited_email);
create index if not exists profiles_group_id_idx       on public.profiles(group_id);

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGN UP
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Helper: returns current user's group_id bypassing RLS (avoids infinite recursion in profiles policy)
create or replace function public.get_my_group_id()
returns uuid
language sql
security definer
stable
as $$
  select group_id from public.profiles where id = auth.uid()
$$;

alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_invites enable row level security;
alter table public.expenses      enable row level security;

-- Profiles: users see profiles in their group + their own
create policy "Profiles: select own group"
  on public.profiles for select
  using (
    auth.uid() = id
    or group_id = public.get_my_group_id()
  );

create policy "Profiles: update own"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Profiles: insert own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Groups: see own group
create policy "Groups: select own"
  on public.groups for select
  using (
    id = (select group_id from public.profiles where id = auth.uid())
  );

create policy "Groups: insert"
  on public.groups for insert
  with check (auth.uid() = created_by);

create policy "Groups: update by creator"
  on public.groups for update
  using (auth.uid() = created_by);

-- Group invites: see invites sent to me or by me
create policy "Invites: select relevant"
  on public.group_invites for select
  using (
    invited_by = auth.uid()
    or invited_email = (select email from public.profiles where id = auth.uid())
    or group_id = (select group_id from public.profiles where id = auth.uid())
  );

create policy "Invites: insert by group member"
  on public.group_invites for insert
  with check (
    group_id = (select group_id from public.profiles where id = auth.uid())
  );

create policy "Invites: update (accept)"
  on public.group_invites for update
  using (
    invited_email = (select email from public.profiles where id = auth.uid())
  );

-- Group Categories
create table if not exists public.group_categories (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  label      text not null,
  emoji      text not null default '📦',
  color      text not null default '#6b7280',
  position   smallint not null default 0,
  created_at timestamptz default now()
);

create index if not exists group_categories_group_id_idx on public.group_categories(group_id);

alter table public.group_categories enable row level security;

create policy "Categories: select by group member"
  on public.group_categories for select
  using (group_id = public.get_my_group_id());

create policy "Categories: insert by admin"
  on public.group_categories for insert
  with check (
    group_id = public.get_my_group_id()
    and (select created_by from public.groups where id = group_id) = auth.uid()
  );

create policy "Categories: update by admin"
  on public.group_categories for update
  using (
    group_id = public.get_my_group_id()
    and (select created_by from public.groups where id = group_id) = auth.uid()
  );

create policy "Categories: delete by admin"
  on public.group_categories for delete
  using (
    group_id = public.get_my_group_id()
    and (select created_by from public.groups where id = group_id) = auth.uid()
  );

-- ============================================================
-- INVESTMENT GROUPS
-- ============================================================

create table if not exists public.investment_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz default now()
);

create table if not exists public.investment_group_invites (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.investment_groups(id) on delete cascade,
  invited_email  text not null,
  invited_by     uuid references auth.users(id) on delete set null,
  accepted       boolean not null default false,
  created_at     timestamptz default now()
);

alter table public.profiles
  add column if not exists investment_group_id uuid references public.investment_groups(id) on delete set null;

create index if not exists profiles_investment_group_id_idx   on public.profiles(investment_group_id);
create index if not exists inv_group_invites_email_idx        on public.investment_group_invites(invited_email);

create or replace function public.get_my_investment_group_id()
returns uuid
language sql
security definer
stable
as $$
  select investment_group_id from public.profiles where id = auth.uid()
$$;

create or replace function public.remove_investment_group_member(member_id uuid, grp_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select created_by from public.investment_groups where id = grp_id) != auth.uid() then
    raise exception 'Only the group admin can remove members';
  end if;
  if member_id = auth.uid() then
    raise exception 'Admin cannot remove themselves from the group';
  end if;
  update public.profiles set investment_group_id = null
    where id = member_id and investment_group_id = grp_id;
end;
$$;

alter table public.investment_groups        enable row level security;
alter table public.investment_group_invites enable row level security;

create policy "InvGroups: select own"
  on public.investment_groups for select
  using (id = public.get_my_investment_group_id());

create policy "InvGroups: insert"
  on public.investment_groups for insert
  with check (auth.uid() = created_by);

create policy "InvGroups: update by creator"
  on public.investment_groups for update
  using (auth.uid() = created_by);

create policy "InvInvites: select relevant"
  on public.investment_group_invites for select
  using (
    invited_by = auth.uid()
    or invited_email = (select email from public.profiles where id = auth.uid())
    or group_id = public.get_my_investment_group_id()
  );

create policy "InvInvites: insert by group member"
  on public.investment_group_invites for insert
  with check (group_id = public.get_my_investment_group_id());

create policy "InvInvites: update (accept)"
  on public.investment_group_invites for update
  using (invited_email = (select email from public.profiles where id = auth.uid()));

-- Investment Tickers (watchlist per profile)
create table if not exists public.investment_tickers (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  symbol     text not null,
  created_at timestamptz default now(),
  unique(profile_id, symbol)
);

create index if not exists investment_tickers_profile_id_idx on public.investment_tickers(profile_id);

alter table public.investment_tickers enable row level security;

create policy "InvTickers: own"
  on public.investment_tickers for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ============================================================
-- EXPENSES
-- ============================================================

-- Expenses: group members see all, only owner can modify
create policy "Expenses: select by group member"
  on public.expenses for select
  using (
    group_id = (select group_id from public.profiles where id = auth.uid())
  );

create policy "Expenses: insert own"
  on public.expenses for insert
  with check (
    auth.uid() = user_id
    and group_id = (select group_id from public.profiles where id = auth.uid())
  );

create policy "Expenses: update own"
  on public.expenses for update
  using (auth.uid() = user_id);

create policy "Expenses: delete own"
  on public.expenses for delete
  using (auth.uid() = user_id);

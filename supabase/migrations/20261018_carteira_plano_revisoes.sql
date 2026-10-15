-- Carteira — revisões do plano (a partir de um ano futuro), ligadas a cada versão do plano.
-- Run this in Supabase SQL Editor (depois das migrations anteriores da Carteira)
--
-- * carteira_plano_revisoes: a partir do início do ano 'ano', os campos preenchidos (aporte mensal,
--   rentabilidades pessimista/otimista, retirada, último ano de aporte) passam a valer; os vazios continuam como estavam.
--   Cada revisão pertence a uma versão do plano e some junto com ela.
-- * carteira_salvar_plano: passa a gravar as revisões enviadas (o resto é igual à versão anterior). A data de
--   criação da revisão é mantida; a de atualização só muda quando os valores mudam.
-- SECURITY INVOKER: o RLS continua valendo. Não altera dados existentes.

begin;

-- (id, profile_id) único: base da chave estrangeira composta das revisões; só cria se ainda não existir
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'carteira_planos_id_profile_uk') then
    alter table public.carteira_planos add constraint carteira_planos_id_profile_uk unique (id, profile_id);
  end if;
end $$;

create table if not exists public.carteira_plano_revisoes (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  plano_id       uuid not null,
  ano            int  not null check (ano between 1990 and 2200),
  aporte_mensal  numeric(16,2) check (aporte_mensal >= 0),
  rent_pess_pct  numeric(7,4),
  rent_otim_pct  numeric(7,4),
  retirada_pct   numeric(7,4) check (retirada_pct > 0),
  fim_aporte     int check (fim_aporte between 1990 and 2200),   -- último ano com aporte (muda o início do usufruto)
  created_at     timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),   -- muda só quando os valores da revisão mudam
  unique (plano_id, ano),
  foreign key (plano_id, profile_id) references public.carteira_planos(id, profile_id) on delete cascade
);

-- se uma versão anterior deste script já criou a tabela (sem estas colunas), acrescenta
alter table public.carteira_plano_revisoes
  add column if not exists fim_aporte int check (fim_aporte between 1990 and 2200);
alter table public.carteira_plano_revisoes
  add column if not exists atualizado_em timestamptz not null default now();

create index if not exists carteira_plano_revisoes_plano_idx on public.carteira_plano_revisoes(plano_id);

alter table public.carteira_plano_revisoes enable row level security;

drop policy if exists "Carteira: own" on public.carteira_plano_revisoes;
create policy "Carteira: own" on public.carteira_plano_revisoes
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- membros do grupo de investimento leem a carteira do administrador (somente leitura)
drop policy if exists "Carteira: group members view admin" on public.carteira_plano_revisoes;
create policy "Carteira: group members view admin" on public.carteira_plano_revisoes
  for select using (
    profile_id = (select ig.created_by from public.investment_groups ig
                  where ig.id = public.get_my_investment_group_id()));

create or replace function public.carteira_salvar_plano(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  atual_id uuid;
  novo_id uuid;
  proxima int;
  perp boolean := coalesce((p->>'perpetuo')::boolean, true);
begin
  if uid is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;

  select id into atual_id from carteira_planos where profile_id = uid and em_uso;

  if atual_id is null or p->>'modo' = 'nova' then
    select coalesce(max(versao), 0) + 1 into proxima from carteira_planos where profile_id = uid;
    update carteira_planos set em_uso = false where profile_id = uid and em_uso;
    insert into carteira_planos (profile_id, versao, em_uso, ano_inicio, patrimonio_inicial, aporte_mensal, anos_aporte,
                                 perpetuo, anos_usufruto, retirada_pct, rent_pess_pct, rent_otim_pct)
    values (uid, proxima, true, (p->>'ano_inicio')::int, (p->>'patrimonio_inicial')::numeric, (p->>'aporte_mensal')::numeric,
            (p->>'anos_aporte')::int, perp, case when perp then null else (p->>'anos_usufruto')::int end,
            (p->>'retirada_pct')::numeric, (p->>'rent_pess_pct')::numeric, (p->>'rent_otim_pct')::numeric)
    returning id into novo_id;
  else
    update carteira_planos set
      ano_inicio = (p->>'ano_inicio')::int,
      patrimonio_inicial = (p->>'patrimonio_inicial')::numeric,
      aporte_mensal = (p->>'aporte_mensal')::numeric,
      anos_aporte = (p->>'anos_aporte')::int,
      perpetuo = perp,
      anos_usufruto = case when perp then null else (p->>'anos_usufruto')::int end,
      retirada_pct = (p->>'retirada_pct')::numeric,
      rent_pess_pct = (p->>'rent_pess_pct')::numeric,
      rent_otim_pct = (p->>'rent_otim_pct')::numeric
    where id = atual_id and profile_id = uid
    returning id into novo_id;
  end if;

  -- Revisões do plano: remove as que saíram e grava as enviadas; a data de criação de uma revisão que
  -- já existia (mesmo ano) é preservada
  delete from carteira_plano_revisoes where plano_id = novo_id and profile_id = uid
    and ano not in (select x.ano from jsonb_to_recordset(coalesce(p->'revisoes', '[]')) as x(ano int));
  insert into carteira_plano_revisoes (profile_id, plano_id, ano, aporte_mensal, rent_pess_pct, rent_otim_pct, retirada_pct, fim_aporte)
  select uid, novo_id, x.ano, x.aporte_mensal, x.rent_pess_pct, x.rent_otim_pct, x.retirada_pct, x.fim_aporte
  from jsonb_to_recordset(coalesce(p->'revisoes', '[]')) as x(
    ano int, aporte_mensal numeric, rent_pess_pct numeric, rent_otim_pct numeric, retirada_pct numeric, fim_aporte int)
  on conflict (plano_id, ano) do update set
    aporte_mensal = excluded.aporte_mensal, rent_pess_pct = excluded.rent_pess_pct, rent_otim_pct = excluded.rent_otim_pct,
    retirada_pct = excluded.retirada_pct, fim_aporte = excluded.fim_aporte, atualizado_em = now()
  where (carteira_plano_revisoes.aporte_mensal, carteira_plano_revisoes.rent_pess_pct, carteira_plano_revisoes.rent_otim_pct,
         carteira_plano_revisoes.retirada_pct, carteira_plano_revisoes.fim_aporte)
        is distinct from (excluded.aporte_mensal, excluded.rent_pess_pct, excluded.rent_otim_pct,
                          excluded.retirada_pct, excluded.fim_aporte);

  return novo_id;
end;
$$;

revoke execute on function public.carteira_salvar_plano(jsonb) from anon;

commit;

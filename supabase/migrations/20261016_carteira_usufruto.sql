-- Carteira — Fase 6 (docs/carteira/REGRAS.md §3 e §4): usufruto e histórico de retiradas.
-- Run this in Supabase SQL Editor (depois das migrations anteriores da Carteira)
--
-- * carteira_retiradas: histórico do saque mensal (inicial, proteção, retorno ao pico, aumento) e a
--   decisão do usuário (aceito/recusado) nas sugestões. A correção pelo IPCA é calculada, não gravada.
-- * carteira_iniciar_usufruto: passa a fase para 'usufruto' e grava a retirada inicial.
-- * carteira_registrar_retirada: grava uma decisão (aceite ou recusa) sobre uma sugestão.
-- SECURITY INVOKER: rodam com as permissões do usuário, então o RLS continua valendo.
-- Não mexe em nenhuma tabela existente além de carteira_config (fase e início do usufruto).

begin;

create table if not exists public.carteira_retiradas (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  vigente_desde   date not null,
  valor_mensal    numeric(16,2) not null check (valor_mensal >= 0),
  valor_anterior  numeric(16,2) check (valor_anterior >= 0),   -- só na proteção: valor antes da redução
  motivo          text not null check (motivo in ('inicial','protecao','retorno_pico','aumento')),
  decisao         text check (decisao in ('aceito','recusado')),
  created_at      timestamptz not null default now()
);

create index if not exists carteira_retiradas_profile_idx on public.carteira_retiradas(profile_id, vigente_desde);

alter table public.carteira_retiradas enable row level security;

drop policy if exists "Carteira: own" on public.carteira_retiradas;
create policy "Carteira: own" on public.carteira_retiradas
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- membros do grupo de investimento leem a carteira do administrador (somente leitura)
drop policy if exists "Carteira: group members view admin" on public.carteira_retiradas;
create policy "Carteira: group members view admin" on public.carteira_retiradas
  for select using (
    profile_id = (select ig.created_by from public.investment_groups ig
                  where ig.id = public.get_my_investment_group_id()));

create or replace function public.carteira_iniciar_usufruto(p jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inicio date := (p->>'inicio')::date;
  valor numeric := (p->>'valor_mensal')::numeric;
begin
  if uid is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  if inicio is null or valor is null or valor < 0 then
    raise exception 'Informe a data de início e o saque mensal.';
  end if;
  if not exists (select 1 from carteira_config where profile_id = uid) then
    raise exception 'Configure a carteira antes de iniciar o usufruto.';
  end if;
  if exists (select 1 from carteira_config where profile_id = uid and fase = 'usufruto') then
    raise exception 'O usufruto já foi iniciado.';
  end if;

  update carteira_config set fase = 'usufruto', inicio_usufruto = inicio where profile_id = uid;
  delete from carteira_retiradas where profile_id = uid;
  insert into carteira_retiradas (profile_id, vigente_desde, valor_mensal, motivo)
  values (uid, inicio, valor, 'inicial');
end;
$$;

create or replace function public.carteira_registrar_retirada(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  novo uuid;
begin
  if uid is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  if not exists (select 1 from carteira_config where profile_id = uid and fase = 'usufruto') then
    raise exception 'O usufruto ainda não foi iniciado.';
  end if;
  if p->>'motivo' not in ('protecao','retorno_pico','aumento') or p->>'decisao' not in ('aceito','recusado') then
    raise exception 'Decisão inválida.';
  end if;

  insert into carteira_retiradas (profile_id, vigente_desde, valor_mensal, valor_anterior, motivo, decisao)
  values (uid, (p->>'data')::date, (p->>'valor_mensal')::numeric, nullif(p->>'valor_anterior', '')::numeric,
          p->>'motivo', p->>'decisao')
  returning id into novo;
  return novo;
end;
$$;

revoke execute on function public.carteira_iniciar_usufruto(jsonb) from anon;
revoke execute on function public.carteira_registrar_retirada(jsonb) from anon;

commit;

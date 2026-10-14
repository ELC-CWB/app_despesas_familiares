-- Carteira — Fase 5 (docs/carteira/SPEC.md §4.3): versões do plano.
-- Run this in Supabase SQL Editor (depois das migrations anteriores da Carteira)
--
-- * carteira_salvar_plano: 'atualizar' sobrescreve a versão em uso; 'nova' cria a versão seguinte
--   e a coloca em uso (a anterior deixa de estar). Sem plano ainda, cria a versão 1.
-- * carteira_usar_versao: troca a versão em uso, preservando "exatamente uma em uso por usuário".
-- SECURITY INVOKER: rodam com as permissões do usuário, então o RLS continua valendo.
-- Não mexe em nenhuma tabela existente.

begin;

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

  return novo_id;
end;
$$;

create or replace function public.carteira_usar_versao(plano_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  if not exists (select 1 from carteira_planos where id = plano_id and profile_id = uid) then
    raise exception 'Versão do plano não encontrada.';
  end if;
  update carteira_planos set em_uso = false where profile_id = uid and em_uso and id <> plano_id;
  update carteira_planos set em_uso = true where id = plano_id and profile_id = uid;
end;
$$;

revoke execute on function public.carteira_salvar_plano(jsonb) from anon;
revoke execute on function public.carteira_usar_versao(uuid) from anon;

commit;

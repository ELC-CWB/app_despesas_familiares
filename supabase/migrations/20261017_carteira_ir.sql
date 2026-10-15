-- Carteira — Fase 7 (docs/carteira/REGRAS.md §7), parte 1: imposto de renda.
-- Run this in Supabase SQL Editor (depois das migrations anteriores da Carteira)
--
-- * carteira_ativos.aliquota_ir_pct: alíquota de IR própria do ativo (vazia = usa a do tipo, em
--   Configurações › Impostos). Útil quando ativos do mesmo tipo têm alíquotas diferentes (ex.: ETFs de
--   renda fixa com prazos médios diferentes).
-- * carteira_ativos.sede: sede (domicílio) do ativo, só informativa (ex.: Brasil, Irlanda). Aparece na tabela Posições.
-- * carteira_salvar_estrutura: passa a gravar as novas colunas (o resto da função é igual à versão anterior).
-- * carteira_ir_mensal: marca os DARFs pagos (o valor do imposto é calculado a partir das movimentações).
-- SECURITY INVOKER: o RLS continua valendo. Não altera dados existentes.

begin;

alter table public.carteira_ativos
  add column if not exists aliquota_ir_pct numeric(6,3) check (aliquota_ir_pct is null or (aliquota_ir_pct >= 0 and aliquota_ir_pct <= 100));

alter table public.carteira_ativos add column if not exists sede text check (sede is null or char_length(sede) <= 60);

create table if not exists public.carteira_ir_mensal (
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  competencia  date not null,                       -- primeiro dia do mês da apuração
  categoria    text not null default 'b3',         -- DARF 6015 (renda variável na B3)
  darf_pago    boolean not null default false,
  pago_em      date,
  primary key (profile_id, competencia, categoria)
);

alter table public.carteira_ir_mensal enable row level security;

drop policy if exists "Carteira: own" on public.carteira_ir_mensal;
create policy "Carteira: own" on public.carteira_ir_mensal
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- membros do grupo de investimento leem a carteira do administrador (somente leitura)
drop policy if exists "Carteira: group members view admin" on public.carteira_ir_mensal;
create policy "Carteira: group members view admin" on public.carteira_ir_mensal
  for select using (
    profile_id = (select ig.created_by from public.investment_groups ig
                  where ig.id = public.get_my_investment_group_id()));

create or replace function public.carteira_salvar_estrutura(p jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  bloqueado text;
begin
  if uid is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;

  insert into carteira_geografias (id, profile_id, nome, cor, ordem)
  select x.id, uid, trim(x.nome), x.cor, coalesce(x.ordem, 0)
  from jsonb_to_recordset(coalesce(p->'geografias', '[]')) as x(id uuid, nome text, cor text, ordem int)
  on conflict (id) do update set nome = excluded.nome, cor = excluded.cor, ordem = excluded.ordem;

  insert into carteira_corretoras (id, profile_id, nome, mercado, corr_br_pct, corr_br_min, corr_ext_pct,
                                   corr_ext_min_usd, emolumentos_pct, custodia_pct, spread_pct, iof_ida_pct, iof_volta_pct)
  select x.id, uid, trim(x.nome), x.mercado, x.corr_br_pct, x.corr_br_min, x.corr_ext_pct,
         x.corr_ext_min_usd, x.emolumentos_pct, x.custodia_pct, x.spread_pct, x.iof_ida_pct, x.iof_volta_pct
  from jsonb_to_recordset(coalesce(p->'corretoras', '[]')) as x(
    id uuid, nome text, mercado text, corr_br_pct numeric, corr_br_min numeric, corr_ext_pct numeric,
    corr_ext_min_usd numeric, emolumentos_pct numeric, custodia_pct numeric, spread_pct numeric,
    iof_ida_pct numeric, iof_volta_pct numeric)
  on conflict (id) do update set
    nome = excluded.nome, mercado = excluded.mercado, corr_br_pct = excluded.corr_br_pct,
    corr_br_min = excluded.corr_br_min, corr_ext_pct = excluded.corr_ext_pct,
    corr_ext_min_usd = excluded.corr_ext_min_usd, emolumentos_pct = excluded.emolumentos_pct,
    custodia_pct = excluded.custodia_pct, spread_pct = excluded.spread_pct,
    iof_ida_pct = excluded.iof_ida_pct, iof_volta_pct = excluded.iof_volta_pct;

  insert into carteira_blocos (id, profile_id, geografia_id, nome, nome_curto, banda_pp, ordem)
  select x.id, uid, x.geografia_id, trim(x.nome), nullif(trim(x.nome_curto), ''), x.banda_pp, coalesce(x.ordem, 0)
  from jsonb_to_recordset(coalesce(p->'blocos', '[]')) as x(
    id uuid, geografia_id uuid, nome text, nome_curto text, banda_pp numeric, ordem int)
  on conflict (id) do update set
    geografia_id = excluded.geografia_id, nome = excluded.nome, nome_curto = excluded.nome_curto,
    banda_pp = excluded.banda_pp, ordem = excluded.ordem;

  insert into carteira_ativos (id, profile_id, codigo, ticker_cotacao, tipo, mercado, moeda, bloco_id,
                               corretora_id, gestora, alvo_pct, banda_pp, taxa_adm_pct, aliquota_ir_pct, sede, ordem)
  select x.id, uid, upper(trim(x.codigo)), nullif(trim(x.ticker_cotacao), ''), x.tipo, x.mercado, x.moeda,
         x.bloco_id, x.corretora_id, nullif(trim(x.gestora), ''), x.alvo_pct, x.banda_pp,
         coalesce(x.taxa_adm_pct, 0), x.aliquota_ir_pct, nullif(trim(x.sede), ''), coalesce(x.ordem, 0)
  from jsonb_to_recordset(coalesce(p->'ativos', '[]')) as x(
    id uuid, codigo text, ticker_cotacao text, tipo text, mercado text, moeda text, bloco_id uuid,
    corretora_id uuid, gestora text, alvo_pct numeric, banda_pp numeric, taxa_adm_pct numeric, aliquota_ir_pct numeric, sede text, ordem int)
  on conflict (id) do update set
    codigo = excluded.codigo, ticker_cotacao = excluded.ticker_cotacao, tipo = excluded.tipo,
    mercado = excluded.mercado, moeda = excluded.moeda, bloco_id = excluded.bloco_id,
    corretora_id = excluded.corretora_id, gestora = excluded.gestora, alvo_pct = excluded.alvo_pct,
    banda_pp = excluded.banda_pp, taxa_adm_pct = excluded.taxa_adm_pct,
    aliquota_ir_pct = excluded.aliquota_ir_pct, sede = excluded.sede, ordem = excluded.ordem;

  -- Remoções: ativos e corretoras com movimentações não podem sair (histórico do IR)
  select string_agg(a.codigo, ', ' order by a.codigo) into bloqueado
  from carteira_ativos a
  where a.profile_id = uid
    and a.id not in (select (x->>'id')::uuid from jsonb_array_elements(coalesce(p->'ativos', '[]')) x)
    and exists (select 1 from carteira_movimentacoes m where m.ativo_id = a.id);
  if bloqueado is not null then
    raise exception 'Não é possível remover % porque há movimentações registradas.', bloqueado;
  end if;

  select string_agg(c.nome, ', ' order by c.nome) into bloqueado
  from carteira_corretoras c
  where c.profile_id = uid
    and c.id not in (select (x->>'id')::uuid from jsonb_array_elements(coalesce(p->'corretoras', '[]')) x)
    and exists (select 1 from carteira_movimentacoes m where m.corretora_id = c.id);
  if bloqueado is not null then
    raise exception 'Não é possível remover a corretora % porque há movimentações registradas nela.', bloqueado;
  end if;

  delete from carteira_ativos where profile_id = uid
    and id not in (select (x->>'id')::uuid from jsonb_array_elements(coalesce(p->'ativos', '[]')) x);
  delete from carteira_blocos where profile_id = uid
    and id not in (select (x->>'id')::uuid from jsonb_array_elements(coalesce(p->'blocos', '[]')) x);
  delete from carteira_geografias where profile_id = uid
    and id not in (select (x->>'id')::uuid from jsonb_array_elements(coalesce(p->'geografias', '[]')) x);
  delete from carteira_corretoras where profile_id = uid
    and id not in (select (x->>'id')::uuid from jsonb_array_elements(coalesce(p->'corretoras', '[]')) x);

  insert into carteira_config (profile_id, colchao_ativo_id, colchao_min_meses, aliquotas)
  values (uid,
          nullif(p->'config'->>'colchao_ativo_id', '')::uuid,
          coalesce((p->'config'->>'colchao_min_meses')::int, 12),
          coalesce(p->'config'->'aliquotas', '{}'::jsonb))
  on conflict (profile_id) do update set
    colchao_ativo_id = excluded.colchao_ativo_id,
    colchao_min_meses = excluded.colchao_min_meses,
    aliquotas = excluded.aliquotas;
end;
$$;

revoke execute on function public.carteira_salvar_estrutura(jsonb) from anon;

commit;

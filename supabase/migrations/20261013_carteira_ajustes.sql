-- Carteira — ajustes da Fase 1 (rodar depois de 20261013_carteira_base.sql)
-- Run this in Supabase SQL Editor
--
-- * Configurações salva estrutura parcial: listas vazias e soma dos alvos ≠ 100% são aceitas
--   (a tela avisa). O usuário pode montar a carteira aos poucos, sem passar pelos Primeiros passos.
-- * Primeiros passos continuam exigindo soma = 100% e só rodam se ainda não houver nada cadastrado,
--   para nunca sobrescrever uma estrutura montada em Configurações.

begin;

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
                               corretora_id, gestora, alvo_pct, banda_pp, taxa_adm_pct, ordem)
  select x.id, uid, upper(trim(x.codigo)), nullif(trim(x.ticker_cotacao), ''), x.tipo, x.mercado, x.moeda,
         x.bloco_id, x.corretora_id, nullif(trim(x.gestora), ''), x.alvo_pct, x.banda_pp,
         coalesce(x.taxa_adm_pct, 0), coalesce(x.ordem, 0)
  from jsonb_to_recordset(coalesce(p->'ativos', '[]')) as x(
    id uuid, codigo text, ticker_cotacao text, tipo text, mercado text, moeda text, bloco_id uuid,
    corretora_id uuid, gestora text, alvo_pct numeric, banda_pp numeric, taxa_adm_pct numeric, ordem int)
  on conflict (id) do update set
    codigo = excluded.codigo, ticker_cotacao = excluded.ticker_cotacao, tipo = excluded.tipo,
    mercado = excluded.mercado, moeda = excluded.moeda, bloco_id = excluded.bloco_id,
    corretora_id = excluded.corretora_id, gestora = excluded.gestora, alvo_pct = excluded.alvo_pct,
    banda_pp = excluded.banda_pp, taxa_adm_pct = excluded.taxa_adm_pct, ordem = excluded.ordem;

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

create or replace function public.carteira_concluir_onboarding(p jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  pl jsonb := p->'plano';
  soma numeric;
begin
  if uid is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  if exists (select 1 from carteira_config where profile_id = uid and onboarding_concluido)
     or exists (select 1 from carteira_geografias where profile_id = uid)
     or exists (select 1 from carteira_corretoras where profile_id = uid)
     or exists (select 1 from carteira_ativos where profile_id = uid) then
    raise exception 'Já existe uma estrutura cadastrada. Ajuste a carteira em Configurações.';
  end if;

  perform carteira_salvar_estrutura(p->'estrutura');

  select coalesce(sum(alvo_pct), 0) into soma from carteira_ativos where profile_id = uid;
  if abs(soma - 100) > 0.001 then
    raise exception 'A soma dos alvos precisa ser 100%% (hoje está em %).', replace(round(soma, 2)::text, '.', ',') || '%';
  end if;

  insert into carteira_planos (profile_id, versao, em_uso, ano_inicio, patrimonio_inicial, aporte_mensal,
                               anos_aporte, perpetuo, anos_usufruto, retirada_pct, rent_pess_pct, rent_otim_pct)
  values (uid, 1, true, (pl->>'ano_inicio')::int, (pl->>'patrimonio_inicial')::numeric,
          (pl->>'aporte_mensal')::numeric, (pl->>'anos_aporte')::int, (pl->>'perpetuo')::boolean,
          case when (pl->>'perpetuo')::boolean then null else (pl->>'anos_usufruto')::int end,
          (pl->>'retirada_pct')::numeric, (pl->>'rent_pess_pct')::numeric, (pl->>'rent_otim_pct')::numeric);

  insert into carteira_movimentacoes (profile_id, data, tipo, ativo_id, corretora_id, quantidade, preco_unit,
                                      moeda, valor_bruto, cambio_usado, valor_liquido_brl, observacoes)
  select uid, current_date, 'compra', a.id, a.corretora_id, x.quantidade, x.preco_medio, a.moeda,
         round(x.quantidade * x.preco_medio, 2),
         case when a.moeda <> 'BRL' then round(x.custo_total_brl / (x.quantidade * x.preco_medio), 6) end,
         round(x.custo_total_brl, 2),
         'Posição inicial informada nos Primeiros passos'
  from jsonb_to_recordset(coalesce(p->'posicoes', '[]')) as x(
    ativo_id uuid, quantidade numeric, preco_medio numeric, custo_total_brl numeric)
  join carteira_ativos a on a.id = x.ativo_id and a.profile_id = uid;

  update carteira_config set onboarding_concluido = true where profile_id = uid;
end;
$$;

revoke execute on function public.carteira_salvar_estrutura(jsonb) from anon;
revoke execute on function public.carteira_concluir_onboarding(jsonb) from anon;

commit;

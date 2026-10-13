-- Carteira — Fase 1 (docs/carteira/DADOS.md, PLANO.md): estrutura, configuração, plano e movimentações.
-- Run this in Supabase SQL Editor
--
-- Convenções:
-- * profile_id → profiles(id), como o resto do app; percentuais em pontos (3.5 = 3,5%).
-- * Chaves estrangeiras compostas (id, profile_id): um registro só aponta para outro do mesmo usuário.
-- * Acesso: cada usuário edita só a própria carteira; membros de um grupo de investimento
--   veem a carteira do administrador do grupo (somente leitura), como na aba antiga.
-- * Gravação da estrutura e do onboarding por funções (uma transação cada), com RLS valendo.
-- Não mexe em nenhuma tabela existente.

begin;

-- ── updated_at ────────────────────────────────────────────────────────────────

create or replace function public.carteira_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── Geografias ────────────────────────────────────────────────────────────────

create table public.carteira_geografias (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  nome        text not null check (length(trim(nome)) > 0),
  cor         text not null check (cor in ('azul','verde','laranja','roxo','rosa','turquesa','amarelo','cinza')),
  ordem       int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, profile_id)
);

-- ── Corretoras ────────────────────────────────────────────────────────────────

create table public.carteira_corretoras (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  nome              text not null check (length(trim(nome)) > 0),
  mercado           text not null check (mercado in ('brasil','exterior','ambos')),
  corr_br_pct       numeric(9,4)  not null default 0    check (corr_br_pct >= 0),
  corr_br_min       numeric(14,2) not null default 0    check (corr_br_min >= 0),
  corr_ext_pct      numeric(9,4)  not null default 0.2  check (corr_ext_pct >= 0),
  corr_ext_min_usd  numeric(14,2) not null default 2    check (corr_ext_min_usd >= 0),
  emolumentos_pct   numeric(9,4)  not null default 0.03 check (emolumentos_pct >= 0),
  custodia_pct      numeric(9,4)  not null default 0    check (custodia_pct >= 0),
  spread_pct        numeric(9,4)  not null default 1.25 check (spread_pct >= 0),
  iof_ida_pct       numeric(9,4)  not null default 1.1  check (iof_ida_pct >= 0),
  iof_volta_pct     numeric(9,4)  not null default 0.38 check (iof_volta_pct >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, profile_id)
);

-- ── Blocos ────────────────────────────────────────────────────────────────────

create table public.carteira_blocos (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  geografia_id  uuid not null,
  nome          text not null check (length(trim(nome)) > 0),
  nome_curto    text,
  banda_pp      numeric(7,4) check (banda_pp >= 0),           -- null = regra 5/25 sobre o alvo do bloco
  ordem         int  not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, profile_id),
  foreign key (geografia_id, profile_id) references public.carteira_geografias(id, profile_id) on delete restrict
);

-- ── Ativos ────────────────────────────────────────────────────────────────────

create table public.carteira_ativos (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  codigo          text not null check (length(trim(codigo)) > 0),   -- como o usuário vê: VALU, QLBR11
  ticker_cotacao  text,                                             -- como a fonte usa: VALU.L, QLBR11.SA
  tipo            text not null check (tipo in ('acao','etf_acoes','etf_rf','etf_outros','fii','bdr',
                                                'tesouro','cdb','lci','debenture','fundo','cripto')),
  mercado         text not null check (mercado in ('brasil','exterior')),
  moeda           text not null check (moeda in ('BRL','USD','EUR')),
  bloco_id        uuid not null,
  corretora_id    uuid,
  gestora         text,
  alvo_pct        numeric(7,4) not null check (alvo_pct >= 0 and alvo_pct <= 100),
  banda_pp        numeric(7,4) check (banda_pp >= 0),               -- null = regra 5/25
  taxa_adm_pct    numeric(7,4) not null default 0 check (taxa_adm_pct >= 0),
  ativo           boolean not null default true,
  ordem           int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, profile_id),
  -- adiável: permite trocar códigos entre ativos ou remover e recriar um código na mesma gravação
  constraint carteira_ativos_codigo_unico unique (profile_id, codigo) deferrable initially deferred,
  foreign key (bloco_id, profile_id) references public.carteira_blocos(id, profile_id) on delete restrict,
  foreign key (corretora_id, profile_id) references public.carteira_corretoras(id, profile_id)
    on delete set null (corretora_id)
);

-- ── Configuração (uma linha por usuário) ──────────────────────────────────────

create table public.carteira_config (
  profile_id            uuid primary key references public.profiles(id) on delete cascade,
  fase                  text not null default 'acumulacao' check (fase in ('acumulacao','usufruto')),
  inicio_usufruto       date,
  colchao_ativo_id      uuid,
  colchao_min_meses     int not null default 12 check (colchao_min_meses >= 0),
  regra_protecao_on     boolean not null default true,
  regra_queda_pct       numeric(7,4) not null default 20 check (regra_queda_pct >= 0),
  regra_corte_pct       numeric(7,4) not null default 10 check (regra_corte_pct >= 0),
  regra_aumento_on      boolean not null default true,
  regra_gatilho_pct     numeric(7,4) not null default 3  check (regra_gatilho_pct >= 0),
  regra_aumento_pct     numeric(7,4) not null default 10 check (regra_aumento_pct >= 0),
  aliquotas             jsonb not null default '{}'::jsonb,       -- { "etf_acoes": 15, "fii": 20, ... }
  onboarding_concluido  boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  foreign key (colchao_ativo_id, profile_id) references public.carteira_ativos(id, profile_id)
    on delete set null (colchao_ativo_id)
);

-- ── Plano (versões) ───────────────────────────────────────────────────────────

create table public.carteira_planos (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null references public.profiles(id) on delete cascade,
  versao              int  not null check (versao >= 1),
  em_uso              boolean not null default false,
  ano_inicio          int  not null,
  patrimonio_inicial  numeric(16,2) not null check (patrimonio_inicial >= 0),
  aporte_mensal       numeric(16,2) not null check (aporte_mensal >= 0),
  anos_aporte         int  not null check (anos_aporte >= 0),
  perpetuo            boolean not null default true,
  anos_usufruto       int  check (anos_usufruto >= 1),
  retirada_pct        numeric(7,4) not null check (retirada_pct > 0),
  rent_pess_pct       numeric(7,4) not null,
  rent_otim_pct       numeric(7,4) not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (profile_id, versao),
  check (rent_pess_pct < rent_otim_pct),
  check (perpetuo or anos_usufruto is not null)
);

-- exatamente uma versão em uso por usuário
create unique index carteira_planos_em_uso_idx on public.carteira_planos(profile_id) where em_uso;

-- ── Movimentações (base do IR: guarda tudo desde o início) ────────────────────

create table public.carteira_movimentacoes (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references public.profiles(id) on delete cascade,
  data               date not null,
  tipo               text not null check (tipo in ('compra','venda','provento')),
  ativo_id           uuid not null,
  corretora_id       uuid,
  quantidade         numeric(20,8),                 -- null em provento
  preco_unit         numeric(18,6),                 -- na moeda do ativo
  moeda              text not null check (moeda in ('BRL','USD','EUR')),
  valor_bruto        numeric(18,2) not null check (valor_bruto >= 0),   -- na moeda do ativo
  cambio_usado       numeric(18,6),                 -- comercial da operação (exterior)
  ptax_compra        numeric(18,6),
  ptax_venda         numeric(18,6),
  spread_valor       numeric(18,2) not null default 0 check (spread_valor >= 0),   -- custos em R$
  iof_valor          numeric(18,2) not null default 0 check (iof_valor >= 0),
  corretagem         numeric(18,2) not null default 0 check (corretagem >= 0),
  emolumentos        numeric(18,2) not null default 0 check (emolumentos >= 0),
  outras_taxas       numeric(18,2) not null default 0 check (outras_taxas >= 0),
  provento_tipo      text check (provento_tipo in ('dividendo','jcp','rendimento')),
  ir_retido          numeric(18,2) not null default 0 check (ir_retido >= 0),
  ir_estimado        numeric(18,2),
  valor_liquido_brl  numeric(18,2) not null,
  observacoes        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (ativo_id, profile_id) references public.carteira_ativos(id, profile_id) on delete restrict,
  foreign key (corretora_id, profile_id) references public.carteira_corretoras(id, profile_id) on delete restrict,
  check (
    (tipo in ('compra','venda') and quantidade > 0 and preco_unit > 0 and provento_tipo is null)
    or (tipo = 'provento' and quantidade is null and provento_tipo is not null)
  )
);

create index carteira_mov_profile_data_idx on public.carteira_movimentacoes(profile_id, data);
create index carteira_mov_ativo_idx        on public.carteira_movimentacoes(ativo_id);
create index carteira_blocos_profile_idx   on public.carteira_blocos(profile_id);
create index carteira_ativos_profile_idx   on public.carteira_ativos(profile_id);
create index carteira_geos_profile_idx     on public.carteira_geografias(profile_id);
create index carteira_corr_profile_idx     on public.carteira_corretoras(profile_id);

-- ── Triggers de updated_at e RLS ──────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['carteira_geografias','carteira_corretoras','carteira_blocos','carteira_ativos',
                           'carteira_config','carteira_planos','carteira_movimentacoes']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.carteira_set_updated_at()',
                   t || '_updated_at', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all using (profile_id = auth.uid()) with check (profile_id = auth.uid())',
                   'Carteira: own', t);
    -- membros do grupo de investimento leem a carteira do administrador (somente leitura)
    execute format($p$create policy %I on public.%I for select using (
                     profile_id = (select ig.created_by from public.investment_groups ig
                                   where ig.id = public.get_my_investment_group_id()))$p$,
                   'Carteira: group members view admin', t);
  end loop;
end;
$$;

-- ── Gravação da estrutura (Configurações) ─────────────────────────────────────
-- Recebe a estrutura completa e sincroniza: insere/atualiza o que veio e remove o que saiu.
-- SECURITY INVOKER: roda com as permissões do usuário, então o RLS continua valendo.

create or replace function public.carteira_salvar_estrutura(p jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  soma numeric;
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

  select coalesce(sum(alvo_pct), 0) into soma from carteira_ativos where profile_id = uid;
  if abs(soma - 100) > 0.001 then
    raise exception 'A soma dos alvos precisa ser 100%% (hoje está em %).', replace(round(soma, 2)::text, '.', ',') || '%';
  end if;

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

-- ── Conclusão dos Primeiros passos ────────────────────────────────────────────
-- Estrutura + plano (versão 1, em uso) + compras iniciais das posições informadas.

create or replace function public.carteira_concluir_onboarding(p jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  pl jsonb := p->'plano';
begin
  if uid is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  if exists (select 1 from carteira_config where profile_id = uid and onboarding_concluido) then
    raise exception 'A carteira já foi configurada. Ajuste a estrutura em Configurações.';
  end if;

  perform carteira_salvar_estrutura(p->'estrutura');

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

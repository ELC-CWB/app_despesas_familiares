-- Carteira — Fase 2 (docs/carteira/DADOS.md, PLANO.md): dados de mercado e fotos diárias do patrimônio.
-- Run this in Supabase SQL Editor (depois de 20261013_carteira_base.sql e 20261013_carteira_ajustes.sql)
--
-- * mercado_*: dados públicos compartilhados (sem profile_id). Usuários logados só leem;
--   quem grava é o servidor com a chave service_role (rotina diária e botão Atualizar).
-- * carteira_snapshots: patrimônio de cada usuário por dia, gravado pela rotina diária.
-- Não mexe em nenhuma tabela existente.

begin;

create table public.mercado_cotacoes (
  ticker         text not null,                 -- como a fonte usa: QLBR11.SA, VALU.L, USDBRL=X
  data           date not null,                 -- dia do pregão, no fuso da bolsa
  fechamento     numeric(18,6) not null check (fechamento > 0),   -- já normalizado (GBp → GBP)
  volume         numeric(20,0),
  moeda          text,                          -- moeda do preço: BRL, USD, GBP...
  fonte          text not null default 'yahoo',
  intradiaria    boolean not null default false,  -- true = preço do botão Atualizar, ainda não é fechamento
  atualizado_em  timestamptz not null default now(),
  primary key (ticker, data)
);

create table public.mercado_ptax (
  data    date primary key,
  compra  numeric(12,6) not null,
  venda   numeric(12,6) not null
);

create table public.mercado_ipca (
  competencia   date primary key,               -- primeiro dia do mês
  variacao_pct  numeric(9,4) not null
);

create table public.carteira_snapshots (
  profile_id         uuid not null references public.profiles(id) on delete cascade,
  data               date not null,
  patrimonio_brl     numeric(18,2) not null,
  investido_liquido  numeric(18,2) not null,
  created_at         timestamptz not null default now(),
  primary key (profile_id, data)
);

alter table public.mercado_cotacoes   enable row level security;
alter table public.mercado_ptax       enable row level security;
alter table public.mercado_ipca       enable row level security;
alter table public.carteira_snapshots enable row level security;

-- Leitura para usuários logados; sem políticas de escrita (só a service_role grava)
create policy "Mercado: leitura" on public.mercado_cotacoes for select to authenticated using (true);
create policy "Mercado: leitura" on public.mercado_ptax     for select to authenticated using (true);
create policy "Mercado: leitura" on public.mercado_ipca     for select to authenticated using (true);

create policy "Carteira: own" on public.carteira_snapshots for select using (profile_id = auth.uid());
create policy "Carteira: group members view admin" on public.carteira_snapshots for select using (
  profile_id = (select ig.created_by from public.investment_groups ig
                where ig.id = public.get_my_investment_group_id()));

commit;

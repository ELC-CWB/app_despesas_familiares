-- Limite de cadastros por IP (proteção contra robôs). Só o servidor (service_role) lê e grava:
-- RLS ligado e sem políticas, então ninguém acessa pelo navegador.
create table if not exists public.cadastro_tentativas (
  id bigint generated always as identity primary key,
  ip text not null,
  criado_em timestamptz not null default now()
);

create index if not exists cadastro_tentativas_ip_idx on public.cadastro_tentativas (ip, criado_em);

alter table public.cadastro_tentativas enable row level security;

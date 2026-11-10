-- Acessos separados por aplicativo (Despesas e Investimentos). Substitui a tabela e a função da
-- migração 20261022, que contavam sem separar o app (ficaram só com os poucos acessos de teste).
drop function if exists public.registrar_acesso();
drop table if exists public.acessos_usuarios;

create table if not exists public.acessos_app (
  user_id         uuid not null references auth.users(id) on delete cascade,
  app             text not null check (app in ('despesas', 'investimentos')),
  acessos         integer not null default 0,
  primeiro_acesso timestamptz not null default now(),
  ultimo_acesso   timestamptz not null default now(),
  primary key (user_id, app)
);

-- Só o administrador lê (pelo servidor, com service_role): RLS ligado e sem políticas.
alter table public.acessos_app enable row level security;

-- Chamada pelo próprio usuário logado. Uma nova visita ao app conta quando o último acesso
-- àquele app tem mais de 30 minutos; dentro dessa janela só atualiza o horário.
create or replace function public.registrar_acesso_app(p_app text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_app not in ('despesas', 'investimentos') then
    return;
  end if;

  insert into public.acessos_app (user_id, app, acessos)
  values (auth.uid(), p_app, 1)
  on conflict (user_id, app) do update
    set acessos = public.acessos_app.acessos
          + case when public.acessos_app.ultimo_acesso < now() - interval '30 minutes' then 1 else 0 end,
        ultimo_acesso = now();
end;
$$;

revoke all on function public.registrar_acesso_app(text) from public, anon;
grant execute on function public.registrar_acesso_app(text) to authenticated;

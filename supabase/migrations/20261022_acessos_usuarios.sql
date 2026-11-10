-- Registro de acessos por usuário (visitas, primeiro e último acesso).
-- Só o administrador lê (pelo servidor, com service_role): RLS ligado e sem políticas.
create table if not exists public.acessos_usuarios (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  acessos        integer not null default 0,
  primeiro_acesso timestamptz not null default now(),
  ultimo_acesso  timestamptz not null default now()
);

alter table public.acessos_usuarios enable row level security;

-- Chamada pelo próprio usuário logado. Uma nova visita conta quando o último acesso
-- tem mais de 30 minutos; dentro dessa janela só atualiza o horário.
create or replace function public.registrar_acesso()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  insert into public.acessos_usuarios (user_id, acessos)
  values (auth.uid(), 1)
  on conflict (user_id) do update
    set acessos = public.acessos_usuarios.acessos
          + case when public.acessos_usuarios.ultimo_acesso < now() - interval '30 minutes' then 1 else 0 end,
        ultimo_acesso = now();
end;
$$;

revoke all on function public.registrar_acesso() from public, anon;
grant execute on function public.registrar_acesso() to authenticated;

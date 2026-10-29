-- Menu Grupos: exclusão unificada dos grupos de Despesas e de Investimentos.
-- Só o criador do grupo pode excluir. Os membros ficam sem grupo; no grupo de Despesas,
-- os lançamentos, categorias e convites do grupo são apagados em cascata (FKs on delete cascade).
create or replace function public.grupo_excluir(p_tipo text, p_grupo uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tipo = 'despesas' then
    if (select created_by from public.groups where id = p_grupo) is distinct from auth.uid() then
      raise exception 'Somente o administrador do grupo pode excluí-lo';
    end if;
    update public.profiles set group_id = null where group_id = p_grupo;
    delete from public.groups where id = p_grupo;
  elsif p_tipo = 'investimentos' then
    if (select created_by from public.investment_groups where id = p_grupo) is distinct from auth.uid() then
      raise exception 'Somente o administrador do grupo pode excluí-lo';
    end if;
    update public.profiles set investment_group_id = null where investment_group_id = p_grupo;
    delete from public.investment_groups where id = p_grupo;
  else
    raise exception 'Tipo de grupo inválido';
  end if;
end;
$$;

revoke all on function public.grupo_excluir(text, uuid) from public, anon;
grant execute on function public.grupo_excluir(text, uuid) to authenticated;

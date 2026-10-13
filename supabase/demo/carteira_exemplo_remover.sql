-- Apaga TODA a carteira (estrutura, plano, movimentações e fotos) da conta abaixo.
-- Use para remover a carteira de exemplo antes de cadastrar a carteira real.
-- Rode no SQL Editor do Supabase. Não mexe em Despesas, grupos ou acessos,
-- nem nas cotações de mercado (que são públicas e compartilhadas).

do $$
declare
  uid uuid;
begin
  select id into uid from public.profiles where lower(email) = lower('emerson.consolin@gmail.com');
  if uid is null then
    raise exception 'Perfil não encontrado.';
  end if;

  delete from public.carteira_movimentacoes where profile_id = uid;
  delete from public.carteira_snapshots     where profile_id = uid;
  delete from public.carteira_planos        where profile_id = uid;
  delete from public.carteira_config        where profile_id = uid;
  delete from public.carteira_ativos        where profile_id = uid;
  delete from public.carteira_blocos        where profile_id = uid;
  delete from public.carteira_geografias    where profile_id = uid;
  delete from public.carteira_corretoras    where profile_id = uid;
end;
$$;

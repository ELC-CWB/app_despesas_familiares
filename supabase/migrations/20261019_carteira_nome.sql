-- Carteira — nome editável da carteira (ex.: "Carteira teste").
-- Run this in Supabase SQL Editor (depois das migrations anteriores da Carteira)
--
-- * carteira_config.nome: nome que aparece no topo da Visão geral. Vazio = "Carteira de investimentos".
-- Só acrescenta uma coluna opcional; não altera dados existentes.

begin;

alter table public.carteira_config
  add column if not exists nome text check (nome is null or char_length(nome) <= 60);

commit;

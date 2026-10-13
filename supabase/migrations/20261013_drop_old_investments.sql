-- Fase 0 da Carteira (docs/carteira/PLANO.md): remove as tabelas da aba Investimentos antiga.
-- Os dados foram exportados pelo usuário antes desta migration.
-- Run this in Supabase SQL Editor
--
-- NÃO mexe em: Despesas (expenses, groups, group_categories, group_invites), profiles,
-- grupos de investimento (investment_groups, investment_group_invites, profiles.investment_group_id)
-- e controle de acesso (profiles.has_investments_access e suas funções), que continuam em uso.
--
-- Sem CASCADE de propósito: se algo inesperado depender destas tabelas, o comando falha
-- em vez de apagar junto. As policies de cada tabela são removidas com ela.

begin;

drop table if exists public.investment_operations;   -- operações de ações/FIIs (+ policies InvOperations)
drop table if exists public.fixed_income_holdings;   -- aplicações de renda fixa
drop table if exists public.investment_tickers;      -- lista de acompanhamento de tickers

commit;

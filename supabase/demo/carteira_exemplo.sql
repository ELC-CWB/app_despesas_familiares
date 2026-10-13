-- Carteira de EXEMPLO (dados fictícios) para visualizar as telas — docs/carteira/SPEC.md §2
-- Rode no SQL Editor do Supabase. Cria a carteira na conta emerson.consolin@gmail.com.
-- Para apagar depois: supabase/demo/carteira_exemplo_remover.sql
-- Preços de 2026-10-13 (Yahoo); quantidades ajustadas para ~R$ 850.000 na alocação real do protótipo.

do $$
declare
  uid uuid;
begin
  select id into uid from public.profiles where lower(email) = lower('emerson.consolin@gmail.com');
  if uid is null then
    raise exception 'Perfil emerson.consolin@gmail.com não encontrado.';
  end if;
  if exists (select 1 from public.carteira_ativos where profile_id = uid)
     or exists (select 1 from public.carteira_geografias where profile_id = uid)
     or exists (select 1 from public.carteira_corretoras where profile_id = uid) then
    raise exception 'Já existe uma carteira nesta conta. Rode antes supabase/demo/carteira_exemplo_remover.sql.';
  end if;

  insert into public.carteira_corretoras (id, profile_id, nome, mercado, corr_br_pct, corr_br_min, corr_ext_pct, corr_ext_min_usd,
                                          emolumentos_pct, custodia_pct, spread_pct, iof_ida_pct, iof_volta_pct)
  values ('900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', uid, 'Banco Inter', 'ambos', 0, 0, 0.2, 2, 0.03, 0, 1.25, 1.1, 0.38);

  insert into public.carteira_geografias (id, profile_id, nome, cor, ordem) values
    ('633f0d8e-9a29-40d5-93fe-a2dc897ed084', uid, 'Global', 'azul', 0),
    ('8a1f9405-b390-469b-9a95-01bfecb8978d', uid, 'Brasil', 'verde', 1);

  insert into public.carteira_blocos (id, profile_id, geografia_id, nome, nome_curto, banda_pp, ordem) values
    ('b5bb7035-55da-41cb-89ca-677c27c66eb4', uid, '633f0d8e-9a29-40d5-93fe-a2dc897ed084', 'Ações globais', 'Ações', 5, 0),
    ('df307a86-d1bd-414b-ab4e-b707138a4952', uid, '633f0d8e-9a29-40d5-93fe-a2dc897ed084', 'Alternativos', 'Altern.', 2.5, 1),
    ('53bc3313-1d48-4543-bcf5-3cbe49f62d60', uid, '8a1f9405-b390-469b-9a95-01bfecb8978d', 'Ações Brasil', 'Ações', 5, 2),
    ('de0ae6d4-bf24-441c-b7a0-262c9fe7117c', uid, '8a1f9405-b390-469b-9a95-01bfecb8978d', 'Renda fixa', null, 5, 3);

  insert into public.carteira_ativos (id, profile_id, codigo, ticker_cotacao, tipo, mercado, moeda, bloco_id, corretora_id,
                                      gestora, alvo_pct, banda_pp, taxa_adm_pct, ordem) values
    ('841aa4c2-c530-4d95-8267-335006c404d0', uid, 'VALU', 'VALU.L', 'etf_acoes', 'exterior', 'USD', 'b5bb7035-55da-41cb-89ca-677c27c66eb4', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 'Vanguard', 30, 5, 0.07, 0),
    ('140c82af-6591-494d-9496-be1cca1226e2', uid, 'IWVL', 'IWVL.L', 'etf_acoes', 'exterior', 'USD', 'b5bb7035-55da-41cb-89ca-677c27c66eb4', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 'iShares', 10, 2.5, 0.25, 1),
    ('df9f8e5f-d8e2-4795-a850-bc37f6245aaa', uid, 'IWQU', 'IWQU.L', 'etf_acoes', 'exterior', 'USD', 'b5bb7035-55da-41cb-89ca-677c27c66eb4', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 'iShares', 10, 2.5, 0.25, 2),
    ('530b44c9-5e74-4af9-a4a5-4f27668dea9c', uid, 'QLBR11', 'QLBR11.SA', 'etf_acoes', 'brasil', 'BRL', '53bc3313-1d48-4543-bcf5-3cbe49f62d60', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 'Investo', 20, 5, 0.5, 3),
    ('1cc4a082-a4cc-4c1c-8b5f-d5cc625970ad', uid, 'LFTS11', 'LFTS11.SA', 'etf_rf', 'brasil', 'BRL', 'de0ae6d4-bf24-441c-b7a0-262c9fe7117c', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 'Investo', 10, 2.5, 0.19, 4),
    ('bd6f9574-c49a-44cc-adb4-a390b680e1a8', uid, 'B5MB11', 'B5MB11.SA', 'etf_rf', 'brasil', 'BRL', 'de0ae6d4-bf24-441c-b7a0-262c9fe7117c', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 'Bradesco', 15, 3.75, 0.2, 5),
    ('e1f693b4-29db-4863-b36a-efcd611094d7', uid, 'GOLD11', 'GOLD11.SA', 'etf_outros', 'brasil', 'BRL', 'df307a86-d1bd-414b-ab4e-b707138a4952', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 'Trend', 2.5, 1.25, 0.55, 6),
    ('174fd39d-a096-4155-9e2b-3b94b59ba6b0', uid, 'HODL11', 'HODL11.SA', 'etf_outros', 'brasil', 'BRL', 'df307a86-d1bd-414b-ab4e-b707138a4952', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 'Investo', 2.5, 1.25, 0.4, 7);

  insert into public.carteira_config (profile_id, fase, colchao_ativo_id, colchao_min_meses, aliquotas, onboarding_concluido)
  values (uid, 'acumulacao', '1cc4a082-a4cc-4c1c-8b5f-d5cc625970ad', 12,
          '{"acao":15,"etf_acoes":15,"etf_rf":15,"etf_outros":15,"fii":20,"bdr":15,"tesouro":15,"cdb":15,"lci":0,"debenture":15,"fundo":15,"cripto":15,"exterior":15}'::jsonb,
          true);

  insert into public.carteira_planos (profile_id, versao, em_uso, ano_inicio, patrimonio_inicial, aporte_mensal, anos_aporte,
                                      perpetuo, anos_usufruto, retirada_pct, rent_pess_pct, rent_otim_pct)
  values (uid, 1, true, 2024, 450000, 5000, 20, true, null, 3.5, 3, 6);

  insert into public.carteira_movimentacoes (profile_id, data, tipo, ativo_id, corretora_id, quantidade, preco_unit, moeda,
    valor_bruto, cambio_usado, spread_valor, iof_valor, corretagem, emolumentos, provento_tipo, ir_retido, ir_estimado,
    valor_liquido_brl, observacoes) values
    (uid, '2024-03-01', 'compra', '841aa4c2-c530-4d95-8267-335006c404d0', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 5141.88, 3.8786, 'USD', 19943.3, 5, 1279.01, 1125.52, 199.43, 0, null, 0, null, 102320.44, 'Dados de exemplo'),
    (uid, '2024-03-01', 'compra', '140c82af-6591-494d-9496-be1cca1226e2', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 107.38, 61.9086, 'USD', 6647.75, 5, 426.33, 375.17, 66.48, 0, null, 0, null, 34106.71, 'Dados de exemplo'),
    (uid, '2024-03-01', 'compra', 'df9f8e5f-d8e2-4795-a850-bc37f6245aaa', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 71.39, 70.668, 'USD', 5044.99, 5, 323.55, 284.72, 50.45, 0, null, 0, null, 25883.66, 'Dados de exemplo'),
    (uid, '2024-03-01', 'compra', '530b44c9-5e74-4af9-a4a5-4f27668dea9c', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 443, 111.1812, 'BRL', 49253.27, null, 0, 0, 0, 14.78, null, 0, null, 49268.05, 'Dados de exemplo'),
    (uid, '2024-03-01', 'compra', '1cc4a082-a4cc-4c1c-8b5f-d5cc625970ad', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 251, 125.7984, 'BRL', 31575.4, null, 0, 0, 0, 9.47, null, 0, null, 31584.87, 'Dados de exemplo'),
    (uid, '2024-03-01', 'compra', 'bd6f9574-c49a-44cc-adb4-a390b680e1a8', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 329, 113.2248, 'BRL', 37250.96, null, 0, 0, 0, 11.18, null, 0, null, 37262.14, 'Dados de exemplo'),
    (uid, '2024-03-01', 'compra', 'e1f693b4-29db-4863-b36a-efcd611094d7', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 530, 16.8948, 'BRL', 8954.24, null, 0, 0, 0, 2.69, null, 0, null, 8956.93, 'Dados de exemplo'),
    (uid, '2024-03-01', 'compra', '174fd39d-a096-4155-9e2b-3b94b59ba6b0', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 223, 54.7794, 'BRL', 12215.81, null, 0, 0, 0, 3.66, null, 0, null, 12219.47, 'Dados de exemplo'),
    (uid, '2024-03-01', 'compra', '174fd39d-a096-4155-9e2b-3b94b59ba6b0', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 45, 59.1, 'BRL', 2659.5, null, 0, 0, 0, 0.8, null, 0, null, 2660.3, 'Dados de exemplo'),
    (uid, '2025-03-03', 'compra', '841aa4c2-c530-4d95-8267-335006c404d0', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 3999.24, 4.3758, 'USD', 17499.87, 5.75, 1290.65, 1135.77, 201.25, 0, null, 0, null, 103251.95, 'Dados de exemplo'),
    (uid, '2025-03-03', 'compra', '140c82af-6591-494d-9496-be1cca1226e2', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 83.52, 69.8456, 'USD', 5833.5, 5.75, 430.23, 378.6, 67.09, 0, null, 0, null, 34418.57, 'Dados de exemplo'),
    (uid, '2025-03-03', 'compra', 'df9f8e5f-d8e2-4795-a850-bc37f6245aaa', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 55.53, 79.728, 'USD', 4427.3, 5.75, 326.52, 287.34, 50.91, 0, null, 0, null, 26121.73, 'Dados de exemplo'),
    (uid, '2025-03-03', 'compra', '530b44c9-5e74-4af9-a4a5-4f27668dea9c', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 344, 125.4352, 'BRL', 43149.71, null, 0, 0, 0, 12.94, null, 0, null, 43162.65, 'Dados de exemplo'),
    (uid, '2025-03-03', 'compra', '1cc4a082-a4cc-4c1c-8b5f-d5cc625970ad', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 196, 141.9264, 'BRL', 27817.57, null, 0, 0, 0, 8.35, null, 0, null, 27825.92, 'Dados de exemplo'),
    (uid, '2025-03-03', 'compra', 'bd6f9574-c49a-44cc-adb4-a390b680e1a8', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 256, 127.7408, 'BRL', 32701.64, null, 0, 0, 0, 9.81, null, 0, null, 32711.45, 'Dados de exemplo'),
    (uid, '2025-03-03', 'compra', 'e1f693b4-29db-4863-b36a-efcd611094d7', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 412, 19.0608, 'BRL', 7853.05, null, 0, 0, 0, 2.36, null, 0, null, 7855.41, 'Dados de exemplo'),
    (uid, '2025-03-03', 'compra', '174fd39d-a096-4155-9e2b-3b94b59ba6b0', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 174, 61.8024, 'BRL', 10753.62, null, 0, 0, 0, 3.23, null, 0, null, 10756.85, 'Dados de exemplo'),
    (uid, '2026-05-04', 'compra', '841aa4c2-c530-4d95-8267-335006c404d0', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 2285.28, 4.7736, 'USD', 10909.01, 5.45, 762.58, 671.07, 118.91, 0, null, 0, null, 61006.68, 'Dados de exemplo'),
    (uid, '2026-05-04', 'compra', '140c82af-6591-494d-9496-be1cca1226e2', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 47.72, 76.1952, 'USD', 3636.03, 5.45, 254.17, 223.67, 39.63, 0, null, 0, null, 20333.87, 'Dados de exemplo'),
    (uid, '2026-05-04', 'compra', 'df9f8e5f-d8e2-4795-a850-bc37f6245aaa', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 31.73, 86.976, 'USD', 2759.75, 5.45, 192.92, 169.77, 30.08, 0, null, 0, null, 15433.4, 'Dados de exemplo'),
    (uid, '2026-05-04', 'compra', '530b44c9-5e74-4af9-a4a5-4f27668dea9c', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 197, 136.8384, 'BRL', 26957.16, null, 0, 0, 0, 8.09, null, 0, null, 26965.25, 'Dados de exemplo'),
    (uid, '2026-05-04', 'compra', '1cc4a082-a4cc-4c1c-8b5f-d5cc625970ad', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 112, 154.8288, 'BRL', 17340.83, null, 0, 0, 0, 5.2, null, 0, null, 17346.03, 'Dados de exemplo'),
    (uid, '2026-05-04', 'compra', 'bd6f9574-c49a-44cc-adb4-a390b680e1a8', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 146, 139.3536, 'BRL', 20345.63, null, 0, 0, 0, 6.1, null, 0, null, 20351.73, 'Dados de exemplo'),
    (uid, '2026-05-04', 'compra', 'e1f693b4-29db-4863-b36a-efcd611094d7', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 235, 20.7936, 'BRL', 4886.5, null, 0, 0, 0, 1.47, null, 0, null, 4887.97, 'Dados de exemplo'),
    (uid, '2026-05-04', 'compra', '174fd39d-a096-4155-9e2b-3b94b59ba6b0', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 99, 67.4208, 'BRL', 6674.66, null, 0, 0, 0, 2, null, 0, null, 6676.66, 'Dados de exemplo'),
    (uid, '2026-07-10', 'venda', '174fd39d-a096-4155-9e2b-3b94b59ba6b0', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 45, 75.4, 'BRL', 3393, null, 0, 0, 0, 1.02, null, 0, 110.03, 3281.95, 'Rebalanceamento: HODL11 acima da banda. Venda até a borda; valor reinvestido em LFTS11.'),
    (uid, '2026-07-14', 'compra', '1cc4a082-a4cc-4c1c-8b5f-d5cc625970ad', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', 20, 159.4, 'BRL', 3188, null, 0, 0, 0, 0.96, null, 0, null, 3188.96, 'Reinvestimento da venda de HODL11 feita em 10/07.'),
    (uid, '2026-08-20', 'provento', '530b44c9-5e74-4af9-a4a5-4f27668dea9c', '900f8c78-f5c0-4752-9ee4-f2ceb6ad406a', null, null, 'BRL', 412.5, null, 0, 0, 0, 0, 'rendimento', 0, null, 412.5, 'Exemplo de provento.');

  insert into public.carteira_snapshots (profile_id, data, patrimonio_brl, investido_liquido) values
    (uid, '2024-12-31', 322518.32, 304262.57),
    (uid, '2025-12-31', 661211.15, 590367.1);
end;
$$;

-- Cotações de 2026-10-13 (públicas, compartilhadas). A rotina diária e o botão Atualizar as substituem.
insert into public.mercado_cotacoes (ticker, data, fechamento, moeda, fonte) values
  ('VALU.L', '2026-10-13', 4.9725, 'USD', 'yahoo'),
  ('IWVL.L', '2026-10-13', 79.37, 'USD', 'yahoo'),
  ('IWQU.L', '2026-10-13', 90.6, 'USD', 'yahoo'),
  ('QLBR11.SA', '2026-10-13', 142.54, 'BRL', 'yahoo'),
  ('LFTS11.SA', '2026-10-13', 161.28, 'BRL', 'yahoo'),
  ('B5MB11.SA', '2026-10-13', 145.16, 'BRL', 'yahoo'),
  ('GOLD11.SA', '2026-10-13', 21.66, 'BRL', 'yahoo'),
  ('HODL11.SA', '2026-10-13', 70.23, 'BRL', 'yahoo'),
  ('USDBRL=X', '2026-10-13', 5.0266, 'BRL', 'yahoo')
on conflict (ticker, data) do nothing;

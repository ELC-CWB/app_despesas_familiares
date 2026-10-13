# Modelo de dados e fontes

Este modelo é uma **proposta**. O Claude Code deve adaptá-lo ao banco atual: nomes, schema, tabela de usuários e de cotações já existentes. Todas as tabelas do usuário têm `user_id` e **RLS** (`user_id = auth.uid()`).

- **Números:** `numeric`, nunca `float`. Percentuais em pontos (3.5 = 3,5%).
- **Prefixo:** `carteira_`, ou um schema próprio, para não misturar com o resto do app.

## Tabelas

### Estrutura e configuração

```sql
carteira_geografias  (id uuid pk, user_id, nome text, cor text,      -- azul|verde|laranja|roxo|rosa|turquesa|amarelo|cinza
                      ordem int)
carteira_blocos      (id uuid pk, user_id, geografia_id fk, nome text, nome_curto text, ordem int)
carteira_corretoras  (id uuid pk, user_id, nome text, mercado text,   -- brasil|exterior|ambos
                      corr_br_pct numeric, corr_br_min numeric, corr_ext_pct numeric, corr_ext_min_usd numeric,
                      emolumentos_pct numeric default 0.03, custodia numeric,
                      spread_pct numeric, iof_ida_pct numeric, iof_volta_pct numeric)
carteira_ativos      (id uuid pk, user_id, codigo text,               -- como o usuário vê: VALU, QLBR11
                      ticker_cotacao text,                             -- como a fonte usa: VALU.L, QLBR11.SA
                      tipo text,                                       -- acao|etf_acoes|etf_rf|etf_outros|fii|bdr|tesouro|cdb|lci|debenture|fundo|cripto
                      mercado text, moeda text,                        -- brasil|exterior ; BRL|USD|...
                      bloco_id fk, corretora_id fk, gestora text,
                      alvo_pct numeric, banda_pp numeric, taxa_adm_pct numeric,
                      ativo bool default true, ordem int)
carteira_config      (user_id pk, fase text,                          -- acumulacao|usufruto
                      inicio_usufruto date, colchao_ativo_id fk null, colchao_min_meses int default 12,
                      regra_protecao_on bool, regra_queda_pct numeric, regra_corte_pct numeric,
                      regra_aumento_on bool, regra_gatilho_pct numeric, regra_aumento_pct numeric,
                      aliquotas jsonb,                                 -- { etf_acoes: 15, fii: 20, ... }
                      onboarding_concluido bool)
```

### Plano

```sql
carteira_planos      (id uuid pk, user_id, versao int, em_uso bool, criado_em timestamptz, atualizado_em timestamptz,
                      ano_inicio int, patrimonio_inicial numeric, aporte_mensal numeric, anos_aporte int,
                      perpetuo bool, anos_usufruto int, retirada_pct numeric, rent_pess_pct numeric, rent_otim_pct numeric)
-- unique (user_id, versao); exatamente uma linha com em_uso = true por usuário
```

### Movimentações (base do IR: guardar tudo desde o início)

```sql
carteira_movimentacoes (id uuid pk, user_id, data date,
                      tipo text,                                       -- compra|venda|provento
                      ativo_id fk, corretora_id fk,
                      quantidade numeric,                              -- null em provento
                      preco_unit numeric, moeda text,                  -- na moeda do ativo
                      valor_bruto numeric,                             -- na moeda do ativo
                      cambio_usado numeric null,                       -- comercial da operação (exterior)
                      ptax_compra numeric null, ptax_venda numeric null, -- do dia, BCB
                      spread_valor numeric, iof_valor numeric, corretagem numeric, emolumentos numeric, outras_taxas numeric,  -- em R$
                      provento_tipo text null,                         -- dividendo|jcp|rendimento
                      ir_retido numeric,                               -- fonte (JCP, ETF RF, dedo-duro)
                      ir_estimado numeric,                             -- calculado na venda
                      valor_liquido_brl numeric,
                      observacoes text, created_at, updated_at)
```

- A posição e o preço médio são **derivados** dessa tabela (view ou função), não guardados.

### Usufruto, histórico e IR

```sql
carteira_retiradas   (id uuid pk, user_id, vigente_desde date, valor_mensal numeric,
                      motivo text,                                     -- inicial|ipca|protecao|retorno_pico|aumento
                      decisao text null,                               -- aceito|recusado (sugestões)
                      criado_em)
carteira_snapshots   (user_id, data date, patrimonio_brl numeric, investido_liquido numeric,
                      primary key (user_id, data))                     -- diário ou mensal: alimenta túnel, pico e barras
carteira_ir_mensal   (user_id, competencia date, categoria text, ganho numeric, prejuizo_compensado numeric,
                      prejuizo_acumulado numeric, imposto numeric, darf_pago bool, pago_em date)  -- pode começar como view
```

### Dados de mercado (compartilhados, sem user_id; ver se o app já tem)

```sql
cotacoes             (ticker text, data date, fechamento numeric, volume numeric, moeda text, fonte text, atualizado_em,
                      primary key (ticker, data))
ptax                 (data date pk, compra numeric, venda numeric)
ipca_mensal          (competencia date pk, variacao_pct numeric)
```

## Fontes

| Dado | Fonte | Observação |
|---|---|---|
| Cotação e volume B3 | **Yahoo Finance** (já usado no app), ticker `XXXX11.SA` | Reaproveitar o fetcher existente |
| Cotação e volume LSE | Yahoo, ticker `VALU.L`, `IWVL.L`, `IWQU.L` | Conferir a moeda retornada: alguns tickers `.L` vêm em GBP ou em pence (GBp). VALU, IWVL e IWQU são classes em USD; validar |
| Dólar do dia | Yahoo `USDBRL=X` | Para patrimônio e exibição |
| PTAX (IR) | API do Banco Central (Olinda, `CotacaoDolarDia`) | Gratuita e oficial. Obrigatória para o IR |
| IPCA | BCB SGS série 433 | Correção da retirada e deflação real × plano |
| Patrimônio (PL) de ETFs BR | CVM dados abertos (a verificar) | Fica para depois; a salvaguarda de tamanho começa só com volume |

- **Rotina diária**, como cron no Vercel ou no Supabase, de preferência ampliando o job que já existe:
  - buscar o fechamento e o volume dos tickers de todos os ativos cadastrados (distintos);
  - buscar `USDBRL=X`, a PTAX e, mensalmente, o IPCA;
  - gravar um snapshot do patrimônio de cada usuário.
- **Botão Atualizar:** busca a cotação intradiária sob demanda. Mostrar "atraso de até 15 min".
- **Resiliência:** a API do Yahoo não é oficial. Sempre usar a última cotação válida salva no banco e mostrar a data dela. Se o Yahoo falhar, considerar o brapi.dev como alternativa para a B3.

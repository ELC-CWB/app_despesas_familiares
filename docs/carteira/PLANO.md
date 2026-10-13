# Plano de implementação

Trabalhar **uma fase por vez**. Ao fim de cada fase, mostrar o resultado e esperar o OK do usuário. Quando faltar uma definição, perguntar em vez de supor.

## Fase 0: Remover a aba Investimentos

O usuário quer **eliminar por completo** a aba Investimentos atual e colocar este módulo no lugar.

1. Mapear tudo o que pertence à aba: rotas, páginas, componentes, hooks, chamadas de API, tabelas, views, funções e policies no Supabase, jobs de cotação e itens de menu.
2. Verificar se **há dados reais** nas tabelas de investimentos. Se houver, mostrar ao usuário o que existe e perguntar se algo deve ser migrado (por exemplo, operações antigas viram `carteira_movimentacoes`) antes de apagar.
3. **Preservar o fetcher de cotações do Yahoo:** ele não vai embora com a aba. Deve virar um serviço compartilhado do app, usado pelo módulo novo. Se hoje ele estiver dentro da aba, extraí-lo antes da remoção.
4. Fazer um **backup/dump** das tabelas antes de qualquer `DROP`. Apagar tabelas só depois da confirmação explícita do usuário. Usar migrations versionadas.
5. Remover código e menu; a rota pode manter o caminho atual (ex.: `/investimentos`) apontando para o módulo novo.

## Fase 1: Base

- Migrations das tabelas de estrutura, configuração, plano e movimentações (`DADOS.md`), com RLS.
- **Configurações** (§4.5 da SPEC): corretoras, geografias e blocos, ativos (com `ticker_cotacao` e `gestora`), colchão e impostos.
- **Primeiros passos** (§4.1): aparece quando o usuário não tem estrutura cadastrada.

## Fase 2: Cotações

- Ampliar o fetcher do Yahoo para:
  - os sufixos `.SA` e `.L`, conferindo a moeda e o caso GBp;
  - volume;
  - `USDBRL=X`.
- PTAX e IPCA pelo BCB.
- Rotina diária com snapshot de patrimônio.
- Botão Atualizar.
- Cotação do dólar no canto da navegação.

## Fase 3: Movimentações

- Compra, Venda e Provento com cálculo de custos (`REGRAS.md` §5), cotas, efeito na carteira e custos de aquisição.
- Histórico com filtros, modal de detalhes e observações.
- Pré-preenchimento por query string.
- Gravar a PTAX do dia em cada operação.

## Fase 4: Visão geral

- Gráfico de rosca em 3 anéis, tabela Real x planejado e faixa de status.
- Sugestão de aporte.
- Salvaguardas 1 e 2, se confirmadas.

## Fase 5: Plano

- Premissas, túnel, perpetuidade, retiradas estimadas e barras de investido líquido (rótulo "Investido líquido").
- Versões do plano.
- Regras de ajuste da retirada.

## Fase 6: Usufruto

- Fase da carteira e início do usufruto.
- Saque do mês com a escolha do ativo (`REGRAS.md` §3) e a cobertura do colchão.
- Guardrails com aceitar/recusar, registro em `carteira_retiradas` e correção anual pelo IPCA.

## Fase 7: Imposto de renda

- **Parte 1:** preço médio, IR por venda, prejuízo a compensar e aviso de DARF mensal (`REGRAS.md` §7). Antes, verificar os pontos marcados "verificar".
- **Parte 2:** relatório anual para a declaração. Deve estar pronto antes da temporada de declaração seguinte ao primeiro ano de uso.

## Testes

- Testes unitários para as funções puras, sem dependência de UI:
  - banda e status;
  - projeção do plano e retirada máxima perpétua;
  - escolha do ativo do saque;
  - guardrails;
  - custos de compra e venda;
  - preço médio e IR.
- Os valores do protótipo servem de caso de teste. Por exemplo: retirada perpétua máxima com r = 3% é 2,913%; uma ordem de US$ 500 no exterior paga US$ 2.

## Pendências (decisões do usuário)

1. **Nome do app:** Carteira Perpétua (provisório) ou Prumo. Falta a checagem no INPI e do domínio.
2. **Salvaguardas:** confirmar 1 (concentração por gestora) e 2 (ETF pequeno ou pouco negociado), com os limites padrão. A 3 (sobreposição) fica para depois.
3. **Banda dos blocos:** campo próprio ou regra 5/25 sobre o alvo do bloco.
4. **Pico da proteção nas quedas:** nominal ou corrigido pelo IPCA.
5. **Multiusuário:** o módulo usa o login atual do app. Confirmar se outras pessoas vão usar o app ou só o próprio usuário. Isso muda o cuidado com o onboarding e os textos.
6. **Itens de IR** marcados "verificar" em `REGRAS.md` §7.

## Fora do escopo por enquanto

- Importação de notas de corretagem ou extratos.
- PL dos ETFs pela CVM.
- Sobreposição entre ETFs.
- Integração automática com corretoras.

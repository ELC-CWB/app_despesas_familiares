@AGENTS.md

O módulo Carteira (aba Investimentos) segue `docs/carteira/`; regras financeiras em `docs/carteira/REGRAS.md`.
Decisões já tomadas: navegação no padrão do app (barra lateral + barra inferior no celular); banda dos blocos editável (sugerida pela regra 5/25); grupos de investimento e controle de acesso (`has_investments_access`) mantidos como estão; testes de funções puras com Vitest.
Plano (Fase 5): o usuário vê sempre UM valor de patrimônio (o nominal, igual ao da Visão geral); o túnel, as retiradas e demais cifras do plano são corrigidos pelo IPCA passado e rotulados "em reais de hoje". Não usar o termo "patrimônio real" na interface. Detalhes em `docs/carteira/REGRAS.md` §2.
Proventos: ficam fora do patrimônio, contam como ganho e abatem o investido líquido (compras − vendas − proventos); sem campo de origem na compra. Decisão do usuário, não alterar.
Salvaguardas 1 e 2 (concentração por gestora, ETF pequeno): decidido NÃO implementar por enquanto; não propor de novo até o usuário pedir.

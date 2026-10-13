# Especificação: Carteira Perpétua

## 1. Objetivo

O app ajuda a montar e manter uma carteira de investimentos de longo prazo para **viver de renda**. Ele tem duas fases:

- **Acumulação:** aportes mensais, sempre no ativo mais abaixo do alvo.
- **Usufruto:** retirada mensal corrigida pela inflação. Por padrão a retirada é **perpétua**, para preservar o patrimônio real.

O app é **genérico**: não recomenda ativos. O usuário define a estrutura, os ativos, os alvos e o plano, começando em branco ou a partir de uma estrutura de exemplo. O app mede os desvios, sugere a próxima ação, estima custos e impostos e projeta o plano.

Princípios de produto:

- **Simplicidade.** Pouca informação por tela, textos curtos e diretos, nomes de campo intuitivos. O usuário rejeitou várias vezes blocos redundantes e explicações longas.
- **O app sugere e o usuário decide.** Nenhuma regra é aplicada sozinha.
- **Totalmente responsivo.** Abaixo de 640px a navegação vira uma barra fixa no rodapé, tabelas escondem colunas secundárias e grids viram uma coluna.
- **Português do Brasil.** Formato pt-BR em tudo: `R$ 1.234,56`, `3,5%`, datas `dd/mm/aaaa`. Campos de valor aceitam vírgula decimal.
- **Entrada manual.** Sem importação de notas ou extratos por enquanto.

## 2. Conceitos

- **Geografia:** agrupa blocos (ex.: Global, Brasil). Tem uma cor, escolhida numa paleta de 8: azul, verde, laranja, roxo, rosa, turquesa, amarelo e cinza. Os tons dos blocos derivam dessa cor.
- **Bloco:** agrupa ativos (ex.: Ações globais, Renda fixa). Tem nome e nome curto, que aparece no gráfico. Pertence a uma geografia.
- **Ativo:**
  - Cadastro: código, tipo (para o IR), mercado (Brasil/exterior), moeda, bloco, corretora e taxa de administração (% a.a.).
  - Estratégia: **alvo** (% da carteira) e **banda** de tolerância (± p.p.).
  - O alvo do bloco é a soma dos alvos dos seus ativos. A soma de todos os alvos precisa dar 100%.
- **Colchão de liquidez:** um ativo de renda fixa pós-fixada (ex.: LFTS11). Paga os saques quando nenhum ativo está acima do alvo, para não vender ações em queda. Tem um mínimo de meses de saque (padrão: 12).
- **Plano:**
  - Premissas: patrimônio inicial, aporte mensal, anos de aporte, retirada (% a.a.), rentabilidade real pessimista e otimista, e usufruto perpétuo ou com prazo.
  - Tem **versões**.
- **Movimentação:** compra, venda ou provento.
  - **Venda e provento tiram dinheiro da carteira** até que ele seja reinvestido por uma compra.
  - Investido líquido = compras − vendas − proventos.

### Carteira de exemplo (a do próprio usuário, ainda teórica)

| Geografia | Bloco | Ativo | Mercado | Alvo | Taxa a.a. |
|---|---|---|---|---|---|
| Global | Ações globais (50%) | VALU (LSE, Vanguard FTSE All-World, acumulação) | Exterior, USD | 30% | 0,07% |
| Global | Ações globais | IWVL (LSE, iShares MSCI World Value Factor) | Exterior, USD | 10% | 0,25% |
| Global | Ações globais | IWQU (LSE, iShares MSCI World Quality Factor) | Exterior, USD | 10% | 0,25% |
| Brasil | Ações Brasil (20%) | QLBR11 | B3 | 20% | 0,50% |
| Brasil | Renda fixa (25%) | LFTS11 (colchão de liquidez) | B3 | 10% | 0,19% |
| Brasil | Renda fixa | B5MB11 | B3 | 15% | 0,20% |
| Global | Alternativos (5%) | GOLD11 | B3 | 2,5% | 0,55% |
| Global | Alternativos | HODL11 | B3 | 2,5% | 0,40% |

A taxa média ponderada é de 0,24% a.a. A corretora é o Banco Inter.

Esses ativos **não** devem ser fixos no código. O modelo de exemplo do onboarding traz só geografias e blocos genéricos, sem ativos.

## 3. Navegação

O menu superior tem: **Visão geral · Plano · Movimentações · Configurações**. No canto direito fica a cotação do dólar, pequena (ex.: `US$ 1 = R$ 5,01`), em todas as telas.

**Primeiros passos** (onboarding) aparece quando o usuário ainda não tem estrutura cadastrada.

Abaixo de 640px, o menu vira uma barra fixa no rodapé. O conteúdo tem largura máxima de 1200px.

## 4. Telas

### 4.1 Primeiros passos (`prototipo/1-primeiros-passos.dc.html`)

Assistente em 7 etapas, com barra de progresso e botões Voltar/Continuar. Cada etapa valida antes de avançar.

1. **Ponto de partida:**
   - "Começar em branco": uma geografia e um bloco vazios.
   - "Usar modelo de exemplo": Global e Brasil, com os blocos Ações globais, Alternativos, Ações Brasil e Renda fixa, sem ativos.
2. **Geografias e blocos:** nome e cor de cada geografia; nome e geografia de cada bloco.
3. **Ativos e alvos:**
   - Campos: código, tipo, mercado, bloco, alvo e banda.
   - A banda vem sugerida pela regra 5/25 (ver `REGRAS.md`).
   - Validações: soma = 100% e nenhum bloco vazio.
4. **Corretora:**
   - Campos: nome, mercado, corretagem B3 (% e mínimo), corretagem exterior (% e mínimo em US$), spread e IOF de ida e volta.
   - O padrão é o do Banco Inter.
5. **Plano:**
   - Campos: inicial, aporte, anos de aporte, retirada, rentabilidade pessimista e otimista.
   - Alternância **Perpétuo | Com prazo** (com prazo mostra o campo "anos de usufruto").
   - Prévia com o veredito de perpetuidade.
6. **Posições atuais:** quantidade e preço médio por ativo. Etapa opcional, com botão "Pular". Gera compras iniciais.
7. **Pronto:** resumo da estratégia.

### 4.2 Visão geral (`prototipo/2-visao-geral.dc.html`)

- **Faixa de status** no topo:
  - "Sua carteira está dentro da estratégia", em cinza-azulado; ou
  - "…fora da estratégia definida", em vermelho, listando o que está fora da banda.
- **Patrimônio total**, data das cotações ("Preços de fechamento de dd/mm/aaaa") e botão **Atualizar**. O botão busca cotações do dia e mostra "Cotações de hoje às HH:MM (atraso de até 15 min)".
- **Gráfico de rosca** em 3 anéis: geografia (interno), bloco e ativo (externo).
  - Os ângulos seguem o **alvo**.
  - Quando um ativo está fora da banda, a fatia mostra o desvio em vermelho: sólido se acima, hachurado se abaixo.
  - Os rótulos seguem a curva do anel.
  - Ao passar o mouse ou tocar, destaca a hierarquia (ancestrais e descendentes) e mostra tooltip com nome, % real, valor e alvo.
  - Há uma explicação recolhível, "Como ler o gráfico".
- **Tabela Real x planejado:**
  - Linhas: geografia > bloco > ativo, recuadas, no tom de cor do gráfico.
  - Colunas: Alvo, Banda, Real, Desvio, Valor, Diferença e Status.
  - Fora da banda: texto vermelho (#B42318), sem fundo vermelho.
  - No celular esconde Valor e Diferença.
  - Espaçamento compacto.
- **Cartão de ação, conforme a fase:**
  - **Acumulação:** sugere o próximo aporte no ativo com menor razão real/alvo ("Faltam R$ X"). O botão **Registrar aporte** abre Movimentações › Compra com o ativo preenchido.
  - **Usufruto:**
    - Cartão "Saque do mês": valor, ativo escolhido, motivo, IR estimado e líquido, mais um recolhível "Como o ativo é escolhido" com as 3 regras e a cobertura do colchão em meses.
    - O botão **Registrar venda** abre Movimentações › Venda com ativo e valor preenchidos.
    - Quando uma regra de ajuste dispara, aparece um alerta com **Aceitar | Recusar** (ver `REGRAS.md` §4).
  - No protótipo existem os seletores "Simular fase" e "Mercado: Normal | Queda de 25% | Alta forte" só para demonstração. No app, a fase vem do plano/configuração e o mercado é o real.

### 4.3 Plano (`prototipo/3-plano.dc.html`)

- **Premissas**, em controles deslizantes:
  - patrimônio inicial, aporte mensal, anos de aporte, anos de usufruto (só no modo "Com prazo"), retirada anual bruta, rentabilidade real pessimista e otimista;
  - alternância **Perpétuo | Com prazo**; no perpétuo, o gráfico mostra 40 anos de usufruto.
- **Veredito de perpetuidade** (só no modo perpétuo):
  - verde: "Perpétua mesmo no cenário pessimista";
  - amarelo: "Perpétua só no cenário otimista";
  - vermelho: "Não é perpétua".
  - Amarelo e vermelho mostram a retirada máxima perpétua (% e R$/mês).
- **Cartões:**
  - patrimônio no início do usufruto (faixa pessimista–otimista);
  - retirada mensal bruta (faixa);
  - patrimônio real hoje, com a faixa do plano para o ano atual.
- **Status em relação ao túnel:** Dentro, Abaixo (falta R$ X para a borda pessimista) ou Acima.
- **Gráfico do túnel:**
  - Faixa entre pessimista e otimista, com a linha do patrimônio real e o marcador "hoje".
  - Linha vertical no início do usufruto; a área de usufruto tem fundo #FEF6F5.
  - Ponto vermelho onde o pessimista se esgota.
  - No perpétuo, linha verde tracejada: "Patrimônio a preservar (pessimista)".
- **Retiradas estimadas:** anual e mensal, por cenário (otimista e pessimista), com uma frase de sustentabilidade.
- **"Sugestão de ajuste da retirada"** (recolhível): as duas regras do §4 de `REGRAS.md`, cada uma com liga/desliga e 2 campos em %:
  - "Abaixo do pico" e "Redução";
  - "Retirada abaixo de" e "Aumento".
- **Gráfico de barras empilhadas por ano:** investido líquido + ganho. Renomear o rótulo de "Aportes líquidos" para **"Investido líquido"**.
- **Versões:**
  - "Salvar plano" fica ativo só quando algo mudou. Ele abre um diálogo que lista o que mudou, com as opções **Atualizar a versão N** ou **Salvar como versão N+1**.
  - A lista "Versões do plano (n)" mostra data e resumo de cada versão, com etiquetas "em uso" e "ver".
  - Abrir uma versão antiga mostra uma faixa azul com **Voltar à versão X | Usar a versão Y**. Nesse modo o botão de salvar fica oculto.
  - O gráfico mostra só a versão em uso, sem sobrepor versões antigas.

### 4.4 Movimentações (`prototipo/4-movimentacoes.dc.html`)

- Abas **Compra | Venda | Provento**. A tela aceita pré-preenchimento vindo da Visão geral (no app: query string `?op=venda&ativo=X&valor=Y` ou `?op=compra&ativo=X`).
- **Compra:**
  - Campos:
    - ativo, com a opção "+ Cadastrar novo ativo…", que abre um mini cadastro;
    - corretora;
    - valor da compra (R$, com vírgula);
    - valor da cota, com o link "↻ Atualizar" abaixo e a nota "cotação de HH:MM, atraso de até 15 min";
    - cotas (calculado);
    - observações.
  - Mostra a sugestão do ativo mais abaixo do alvo.
  - Linhas de custo: custos da remessa (spread + IOF, se exterior), corretagem e **valor investido**.
- **Venda:**
  - Mostra a sugestão do ativo brasileiro mais acima do alvo e o quanto vender para voltar à borda da banda.
  - Linhas: IR estimado, corretagem, câmbio no retorno (se exterior) e **valor líquido na conta**.
- **Provento:**
  - Campos: tipo (dividendo, JCP, rendimento), valor bruto e IR retido. Em JCP o IR vem preenchido com 15%.
  - Sugere em que ativo reinvestir.
- **Coluna direita:**
  - "Efeito na carteira": tabela por ativo com Alvo, Antes, Depois e Status. Fica fixa ao rolar a página em telas largas e volta ao fluxo normal abaixo de 900px.
  - Abaixo, alinhado à base, o recolhível **"Custos de aquisição"**: pizza com investido líquido, spread, IOF e corretagem, com filtro por ano.
- **Histórico de movimentações:**
  - Colunas: Data, Ativo, Operação, Corretora, Taxas, Valor da cota, Cotas e Valor líquido.
  - Filtros em popover, abertos ao clicar no título da coluna: Data (de/até, vazio por padrão), Ativo, Operação e Corretora.
  - Clicar numa linha abre um modal com grupos de detalhe:
    - Operação;
    - Câmbio (exterior: cotação comercial e efetiva, valor remetido);
    - Taxas e impostos (cada taxa com a base de cálculo e o total em % da operação);
    - Resumo;
    - campo de **Observações** editável.
  - Totais do período: Compras, Vendas, Proventos (bruto) e Saldo investido (compras − vendas − proventos).

### 4.5 Configurações (`prototipo/5-configuracoes.dc.html`)

Seções recolhíveis, exceto Ativos:

- **Corretoras:**
  - Campos: nome, mercado (Brasil, exterior ou ambos), corretagem B3 (% e mínimo R$), corretagem exterior (% e mínimo US$), custódia, spread, IOF de ida e IOF de volta.
  - Exemplos de custo calculados ao lado (ex.: "ordem de US$ 500 paga US$ 2,00 (0,4%)").
- **Geografias e blocos:** cartões de geografia com paleta de 8 cores e a lista de blocos.
  - Não dá para remover uma geografia com blocos nem um bloco com ativos.
  - O resumo mostra o alvo somado.
- **Ativos** (sempre aberta):
  - Tabela com Código, Tipo, Mercado, Moeda, Bloco, Alvo, Banda, Taxa a.a. e Corretora.
  - Quadro de soma por bloco, com o total (precisa dar 100%) e a taxa média ponderada.
  - Quadro **Colchão de liquidez:** seletor do ativo, mínimo de meses e cobertura atual ("cobre 36 meses de saques"), em verde se ≥ mínimo e vermelho se abaixo.
- **Impostos:** alíquota por tipo de ativo, editável, com nota explicativa de cada tipo.

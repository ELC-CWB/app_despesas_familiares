# Regras financeiras e fórmulas

Todas as regras abaixo foram validadas no protótipo; a lógica correspondente está nos `.dc.html`, em `renderVals()`. Os percentuais são editáveis pelo usuário onde indicado.

## 1. Bandas de tolerância (regra 5/25)

- A banda é ± p.p. em torno do alvo. A sugestão padrão é `banda = min(5 p.p., 25% do alvo)`.
  - Exemplos: alvo 30% → ±5; alvo 10% → ±2,5; alvo 2,5% → ±0,625.
- A banda é editável por ativo. No exemplo, os alternativos usam ±1,25: o usuário preferiu 50% do alvo para ativos muito pequenos.
- O ativo está **fora da banda** quando `|real − alvo| > banda`.
- Os blocos também têm banda. O protótipo usou 5 p.p. e 2,5 p.p. para Alternativos; **a decidir** se o bloco ganha um campo próprio ou usa a regra 5/25 sobre o alvo do bloco.
- As geografias não têm banda.
- **Rebalanceamento:**
  - Acumulação: preferir **comprar** o que está abaixo. Vender só quando um ativo sai da banda, e só até a borda dela: `excesso = (real − (alvo + banda)) × patrimônio`.
  - Usufruto: os saques fazem o rebalanceamento naturalmente (§3).

## 2. Plano (projeção anual, em valores reais, ou seja, em reais de hoje)

```
r = rentabilidade real (pessimista ou otimista)
v[0] = patrimônio inicial
Acumulação (t < anosAporte):      v[t+1] = (v[t] + aporteMensal×12) × (1 + r)
Início do usufruto:               W = v[anosAporte] × retirada%   (fixo em termos reais)
Usufruto:                         saque = min(W, v[t]);  v[t+1] = max(0, (v[t] − saque) × (1 + r))
Esgotamento: primeiro ano em que v[t] − W ≤ 0
```

- O túnel é a faixa entre os caminhos pessimista e otimista. A pessimista é sempre limitada a `otim − 0,5`.
- Horizonte do gráfico: anos de aporte + anos de usufruto. No modo perpétuo, o usufruto exibido é de 40 anos.
- **Retirada máxima perpétua:** `r / (1 + r)`, porque o saque sai no início do ano. Com r = 3%, o máximo é 2,91% a.a.
- **Veredito:** retirada ≤ máx. pessimista → verde; ≤ máx. otimista → amarelo; acima → vermelho.
- **Patrimônio a preservar (perpétuo):** `v_pess[anosAporte]`, desenhado como linha horizontal no túnel.
- **Patrimônio no gráfico:** série anual com o patrimônio em 31/12 (ou hoje, no ano corrente), em reais nominais. Deve sair de snapshots (`DADOS.md`).
- **Comparação patrimônio × plano (DECIDIDO):** o usuário vê **um único valor de patrimônio em todas as telas** (o nominal, o mesmo da Visão geral). Quem é corrigido pela inflação é o **plano**, não o patrimônio:
  - Cada ano do túnel é multiplicado pelo IPCA acumulado desde o início do plano até aquele ano (fator `F`). Para anos passados e o corrente usa-se o IPCA realizado (SGS 433, tabela `mercado_ipca`); para anos futuros, o plano segue em valores reais, sem inflação futura (nenhuma premissa nova).
  - O mesmo vale para a retirada mensal estimada, a retirada máxima perpétua em R$/mês, o patrimônio a preservar e as demais cifras do Plano: aparecem em **reais de hoje**, com o rótulo "em reais de hoje".
  - Matematicamente é idêntico a deflacionar o patrimônio (`patrimônio / F` contra o plano): o status Dentro/Abaixo/Acima do túnel não muda; muda só o que o usuário lê.
  - **Texto da interface:** não usar "patrimônio real". Usar "Patrimônio hoje". Nota no rodapé do Plano: "Valores em reais de hoje. O plano começa em AAAA e a inflação acumulada desde então é de X%; as faixas já estão corrigidas por ela."
  - **Base da correção (implementado):** 1º de janeiro do "ano de início" do plano, campo editável nas premissas. O IPCA vem do BCB (SGS 433) na hora, com a tabela `mercado_ipca` como reserva; só meses inteiros já encerrados entram. Sem IPCA disponível, o Plano avisa que as faixas estão sem correção.
  - O patrimônio inicial do plano é mostrado como "R$ 450.000 em mm/aaaa (R$ 480.000 em reais de hoje)".
  - O pico da proteção nas quedas (§4) e a correção anual do saque (§3) já usam o IPCA e seguem a mesma lógica.
  - Implementação: Fase 5 (Plano). Antes dela, nenhuma tela mostra "patrimônio real" nem faz essa correção.
- **Revisões do plano (a partir de um ano):** cada versão do plano pode ter revisões. A partir do início do ano da revisão, os campos preenchidos (aporte mensal, retirada, rentabilidades pessimista e otimista, último ano de aporte) passam a valer; os vazios continuam como estavam.
  - Valem as revisões já iniciadas no ano t; a pessimista continua limitada a otimista − 0,5.
  - Retirada revista: a base vira `patrimônio do ano da revisão × nova retirada%` (no usufruto) ou vale a partir do início do usufruto (se a revisão for antes dele).
  - Último ano de aporte revisto: a revisão pode prolongar ou encerrar os aportes ("aportar até o ano X"); o início do usufruto e o horizonte se ajustam sozinhos, mesmo que a revisão seja datada depois do início do usufruto das premissas (a projeção é futura: o usufruto passa a começar depois do último ano de aporte). O ano não pode ser anterior ao da revisão menos um. Vale a última revisão que define esse ano.
  - O prazo do usufruto (anos ou perpétuo) e o patrimônio inicial não são revisáveis: para mudá-los, altere as premissas ou crie uma nova versão.
  - Regras: ano depois do início do plano e dentro do horizonte, uma revisão por ano, ao menos um campo preenchido, pessimista < otimista em vigor.
- **Barras por ano:** investido líquido acumulado (cinza) + ganho (verde).

## 3. Saque mensal (usufruto)

- **Valor:** `base anual / 12`.
  - No primeiro ano, `base anual = patrimônio no início do usufruto × retirada%` (padrão 3,5%).
  - A base é corrigida todo ano pelo IPCA dos 12 meses anteriores.
  - Ajustes aceitos pelas regras do §4 também mudam a base.
- **Qual ativo vender:** `excesso(a) = (real% − alvo%) × patrimônio`.
  1. O ativo **negociado no Brasil** com o maior excesso positivo, porque não tem custo de câmbio.
  2. Se nenhum ativo brasileiro estiver acima, o ativo **do exterior** com o maior excesso positivo (tem custo de câmbio na volta).
  3. Se nenhum ativo estiver acima do alvo, o **colchão de liquidez**, para não vender ações em queda.
  4. Se não houver colchão definido, o ativo **mais perto do alvo** (menor |excesso|).
- Se o saque for maior que o excesso do ativo escolhido, avisar que o ativo vai ficar um pouco abaixo do alvo.
- **Cobertura do colchão:** `floor(valor do colchão / saque mensal)` meses. O padrão é um mínimo de 12 meses; abaixo disso, alerta vermelho em Configurações.
- O cartão mostra valor bruto, ativo, motivo, IR estimado e líquido (bruto − IR − câmbio, se exterior).

## 4. Ajuste da retirada (guardrails). O app sugere e o usuário aceita ou recusa.

| Regra | Padrão | Gatilho | Sugestão |
|---|---|---|---|
| **Proteção nas quedas** | Abaixo do pico 20%, Redução 10% | `1 − patrimônio / pico > 20%` | Reduzir a retirada em 10% até a carteira **recuperar o pico**; aí volta ao valor anterior |
| **Aumento quando a carteira cresce** | Retirada abaixo de 3%, Aumento 10% | Revisão **anual**: `retirada anual / saldo < 3%` | Aumentar a retirada em 10%; o novo valor vira a base, corrigida pelo IPCA |

- Cada regra tem liga/desliga e 2 campos em %.
- A proteção é avaliada primeiro; o aumento só é avaliado se ela não disparou.
- **Pico:** o maior patrimônio registrado desde o início do usufruto. **A definir:** pico nominal ou corrigido pelo IPCA. A sugestão é corrigir, para manter coerência com o plano em valores reais.
- **Recusar:**
  - Proteção recusada: o alerta não volta enquanto a situação não mudar (nova queda ou recuperação).
  - Aumento recusado: a sugestão volta na revisão do ano seguinte.
- Toda decisão (aceite ou recusa) deve ser registrada.

## 5. Custos de operação (por corretora; padrão Banco Inter)

| Item | Padrão Inter | Aplicação |
|---|---|---|
| Corretagem B3 | 0% (mín. R$ 0) | `max(v × %, mín)` |
| Emolumentos B3 | 0,03% | sobre o valor da operação na B3 |
| Corretagem exterior | 0,20%, mínimo US$ 2 | `max(v × 0,20%, 2 × dólar)` |
| Spread cambial | 1,25% | remessa e retorno |
| IOF câmbio, ida | 1,1% | remessa para investimento no exterior |
| IOF câmbio, volta | 0,38% | retorno ao Brasil |
| Custódia | 0 | campo existe, sem uso hoje |

- **Compra no exterior** (v = valor em R$ que o usuário tira da conta):
  - `remessa = v × (spread + IOF ida)`
  - `corretagem = max((v − remessa) × %ext, mínUS$ × dólar)`
  - `valor investido = v − remessa − corretagem`
- **Venda no exterior:**
  - `corretagem = max(v × %ext, mínUS$ × dólar)`
  - `câmbio = (v − corretagem) × (spread + IOF volta)`
  - `líquido = v − IR − corretagem − câmbio`
- **Compra e venda na B3:** corretagem (se houver) + emolumentos. Sem câmbio.
- **Dólar:** sempre a cotação de hoje (`USDBRL=X`), sem premissa de câmbio futuro. Nas projeções, o câmbio real fica constante.
- **IOF:** o IOF de câmbio para investimento mudou em 2025. Os percentuais ficam editáveis por corretora e devem ser conferidos com a corretora.

## 6. Movimentações e patrimônio

- **Compra:** aumenta as cotas e o investido.
- **Venda:** reduz as cotas. O valor líquido **sai** da carteira.
- **Provento:** não muda as cotas. O valor líquido **sai** da carteira até ser reinvestido por uma compra. Conta como rendimento da carteira.
- **Investido líquido** = compras − vendas − proventos. **Ganho** = patrimônio − investido líquido.
- **Patrimônio** = Σ cotas × cotação de fechamento × câmbio do dia (para ativos em USD).
- **Posição (cotas, preço médio)** é derivada das movimentações. As posições informadas no onboarding viram compras iniciais.

## 7. Imposto de renda

Escolha do usuário: **controle completo**, em duas fases.

- **Fase 1 (junto com Movimentações):** preço médio, IR por venda, controle de prejuízo a compensar e aviso de DARF.
- **Fase 2 (antes da temporada de declaração):** relatório anual para a declaração, com bens e direitos (custo de aquisição em 31/12), rendimentos e ganhos no exterior.

Por isso, cada movimentação guarda desde o início: data, quantidade, preço, moeda, cada taxa, câmbio comercial usado e **PTAX do dia** (BCB).

Regras gerais (as alíquotas por tipo ficam em Configurações › Impostos, editáveis):

- **Preço médio:** custo total de aquisição (inclui corretagem e emolumentos) ÷ quantidade, ponderado a cada compra. Vendas não mudam o preço médio.
- **ETFs de renda variável na B3** (QLBR11, GOLD11, HODL11):
  - 15% sobre o ganho líquido do mês, **sem** a isenção de R$ 20 mil das ações.
  - Apuração mensal; DARF (código 6015) até o último dia útil do mês seguinte.
  - O prejuízo compensa ganhos futuros da mesma categoria.
  - IRRF de 0,005% sobre o valor de venda ("dedo-duro"), dedutível.
- **ETFs de renda fixa na B3** (LFTS11, B5MB11):
  - Alíquota conforme o prazo médio da carteira do ETF (15% para prazo longo).
  - O IR é **retido na fonte** na venda, então não gera DARF.
- **Ativos no exterior** (VALU, IWVL, IWQU: ETFs irlandeses de acumulação na LSE):
  - Regime da **Lei 14.754/2023**: 15% sobre o resultado anual, apurado na **declaração anual**, sem DARF mensal.
  - Prejuízo compensável dentro da mesma categoria.
  - Resultado apurado em reais.
- **Proventos:** o IR informado pelo usuário (JCP tem 15% retido na fonte).
- **Decisões da Fase 7 (parte 1), conferidas por pesquisa na web em 14/10/2026 e a confirmar com o contador:**
  - **Alíquotas editáveis, por tipo e por ativo.** Padrão: 15% para ETFs de renda variável na B3 (há fontes divergentes sobre 17,5% em 2026) e para o exterior. O campo "IR % (se diferente do tipo)" no ativo tem prioridade sobre o do tipo.
  - **ETFs de renda fixa:** o IR é retido na fonte e não gera DARF. Fontes indicam 25% para o LFTS11 (reenquadrado em fev/2024 pelo prazo médio) e 15% para o B5MB11; o usuário define a alíquota de cada ativo.
  - **Exterior (Lei 14.754/2023):** 15% sobre o resultado anual, pago na declaração, sem DARF. Conversão adotada até confirmação do contador: PTAX de compra do dia da compra para o custo e PTAX de venda do dia da venda para a receita. Corretagem e taxas entram no cálculo; spread e IOF de câmbio não são abatidos (estimativa conservadora). Sem PTAX gravada, usa o câmbio da operação e avisa.
  - **B3 (ações, ETFs e BDRs, FII):** categorias separadas para compensar prejuízo (ações, ETFs/BDRs, FII). Apuração mensal; dedo-duro de 0,005% abatido (não se aplica a FII); DARF abaixo de R$ 10 acumula para o mês seguinte; vencimento no último dia útil do mês seguinte (feriados nacionais fixos; os móveis não entram).
  - O app **estima** o imposto e não substitui um contador; a tela diz isso de forma discreta.
- **Estimativa de IR no formulário de venda:** usa o preço médio real da posição e a alíquota do ativo (ou do tipo). A apuração mensal e o DARF ficam na seção "Imposto de renda" em Movimentações.

## 8. Salvaguardas (alertas na Visão geral)

| # | Alerta | Como | Status |
|---|---|---|---|
| 1 | Concentração por gestora | Σ alvos dos ativos da mesma gestora > limite (ex.: Investo somaria 32,5% na carteira de exemplo). Exige o campo `gestora` no ativo | Proposto para agora; limite padrão a definir |
| 2 | ETF pequeno ou pouco negociado | Volume financeiro médio de 30 dias (Yahoo) abaixo de um limite | Proposto para agora; limite a definir |
| 3 | Sobreposição entre ETFs | Comparar composições | Fica para depois |

O usuário ainda **não confirmou** as salvaguardas 1 e 2 (ver `PLANO.md`).

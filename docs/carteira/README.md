# Carteira Perpétua: pacote de passagem para o Claude Code

Este pacote reúne tudo o que foi definido no protótipo do módulo de carteira de investimentos "para viver de renda". O módulo vai **substituir por completo a aba Investimentos** do app atual (Next.js + Supabase).

Nome provisório: Carteira Perpétua (candidato: **Prumo**; ainda não decidido).

## Conteúdo

| Arquivo | O que tem |
|---|---|
| `SPEC.md` | Objetivo, conceitos e o comportamento de cada tela |
| `REGRAS.md` | Todas as regras financeiras e fórmulas (bandas, plano, saque, ajustes da retirada, custos, IR) |
| `DADOS.md` | Modelo de dados sugerido para o Supabase e fontes de cotação |
| `PLANO.md` | Remoção da aba Investimentos, ordem de construção em fases e pendências |
| `prototipo/*.dc.html` | As 5 telas do protótipo, para referência visual e de comportamento |

## Sobre os arquivos do protótipo

Os `.dc.html` foram feitos numa ferramenta de protótipo e **não rodam sozinhos no navegador**. Cada arquivo tem duas partes:

- **Marcação:** dentro de `<x-dc>`. `{{campo}}` é um valor, `<sc-for list="{{x}}" as="y">` é um loop e `<sc-if value="{{x}}">` é uma condição.
- **Lógica:** uma `class Component extends DCLogic`, em JavaScript puro. `renderVals()` calcula tudo o que a tela mostra, e `setState` funciona como no React.

Na lógica estão as fórmulas e os textos exatos de cada tela. Os dados são **fictícios**: patrimônio de R$ 850.000, percentuais reais, histórico e cotações. A troca de dados entre telas por `localStorage` (`cp-estrutura`, `cp-colchao`, `cp-regras`, `cp-acao`) era só para o protótipo; no app tudo vem do Supabase.

O visual deve seguir **o padrão do app atual** (componentes, tipografia, tema). Do protótipo valem o layout, a hierarquia de informação, os textos e as cores dos gráficos.

## Como começar no Claude Code

1. Copie esta pasta para o repositório, em `docs/carteira/`.
2. Abra o Claude Code na raiz do repositório e envie:

> Leia todos os arquivos em `docs/carteira/` (README, SPEC, REGRAS, DADOS e PLANO; os protótipos em `prototipo/` são referência). Depois analise o app atual: a aba Investimentos (rotas, componentes, tabelas e dados no Supabase), o fetcher de cotações do Yahoo Finance, a autenticação e o padrão visual. Ainda não altere nada. Me devolva: (1) o que existe hoje na aba Investimentos e o que será removido, incluindo se há dados reais nas tabelas; (2) como o modelo de `DADOS.md` se encaixa no banco atual, com os ajustes que você sugerir; (3) o plano da Fase 0 e da Fase 1 de `PLANO.md`. Pergunte o que precisar.

3. Sugestão: adicione ao `CLAUDE.md` do repositório uma linha como "O módulo Carteira segue `docs/carteira/`; regras financeiras em `docs/carteira/REGRAS.md`."

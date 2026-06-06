# Despesas Familiares — Guia de Configuração

## 1. Criar projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um novo projeto
2. Aguarde a inicialização do banco de dados
3. Copie as credenciais em **Project Settings → API**:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2. Executar o schema SQL

1. No painel do Supabase, acesse **SQL Editor**
2. Cole e execute todo o conteúdo do arquivo `supabase/schema.sql`
3. Isso criará as tabelas, índices, políticas RLS e o trigger de criação de perfil

## 3. Configurar variáveis de ambiente

```bash
cp .env.local.example .env.local
```

Edite `.env.local` com suas credenciais do Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJh...
```

## 4. Instalar dependências e rodar localmente

```bash
npm install
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000)

## 5. Deploy na Vercel

1. Faça push do repositório para o GitHub
2. Importe o projeto em [vercel.com](https://vercel.com)
3. Adicione as variáveis de ambiente no painel da Vercel
4. Deploy automático a cada `git push`

---

## Estrutura do projeto

```
src/
├── app/
│   ├── (auth)/           # Login e Cadastro
│   │   ├── login/
│   │   └── register/
│   └── (app)/            # Área autenticada
│       ├── dashboard/    # Dashboard com gráficos
│       ├── expenses/     # Lista de despesas
│       └── settings/     # Grupo e perfil
├── components/
│   ├── ui/               # Componentes base (shadcn-style)
│   ├── layout/           # Sidebar, Header, MobileNav
│   ├── dashboard/        # Cards, gráficos
│   ├── expenses/         # Tabela, filtros, modal
│   └── settings/         # Gerenciamento de grupo
├── lib/
│   ├── supabase/         # client.ts, server.ts, actions.ts
│   └── utils.ts
├── types/index.ts        # Tipos TypeScript + constantes
└── proxy.ts              # Proteção de rotas (Auth)
```

## Funcionalidades

- **Autenticação** — Cadastro, login e sessão via Supabase Auth
- **Grupos familiares** — Criação de grupo e convite por e-mail
- **Dashboard** — Cards de resumo, gráfico de pizza por categoria, barras por membro, tendência mensal
- **Despesas** — Listagem com filtros por mês/ano/categoria/membro, busca por texto
- **Lançamento** — Modal com data, mês de competência, forma de pagamento, categoria e valor
- **Edição/Exclusão** — Apenas o dono da despesa pode editar ou excluir
- **RLS** — Row Level Security garante que cada grupo veja apenas seus próprios dados
- **Responsivo** — Mobile-first com navegação bottom bar em mobile e sidebar em desktop

# Farol de Projetos

Gestão orçamentária de projetos do SESI-AL por rubrica: cadastro de projetos, importação do razão contábil e acompanhamento de saldo a qualquer momento.

Este projeto nasceu como fork podado do [Financeme](https://github.com/) (controle financeiro pessoal), reaproveitando a base técnica (Next.js, Supabase, componentes de UI) e removendo todo o domínio de finanças pessoais.

## Stack

- Next.js 16 (App Router, Webpack)
- Supabase (`@supabase/supabase-js` direto, sem `@supabase/ssr` — não há login de usuário)
- Tailwind CSS + componentes shadcn/ui

## Getting Started

Configure as variáveis de ambiente copiando `.env.example` para `.env.local` e preenchendo:

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
APP_PASSWORD=
SESSION_SECRET=
```

Depois rode o servidor de desenvolvimento:

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no navegador.

## Scripts

```bash
npm run dev      # servidor de desenvolvimento
npm run build    # build de produção (webpack)
npm run start    # servidor de produção
npm run lint     # eslint
npm test         # vitest
```

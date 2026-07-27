# Farol de Projetos

Farol de Projetos é a ferramenta de acompanhamento orçamentário dos projetos institucionais do SESI-AL. Cada projeto tem um valor total, dividido em rubricas (as linhas de despesa previstas), e o aplicativo importa o razão contábil, classifica cada lançamento por rubrica, calcula o saldo disponível a qualquer momento e sinaliza quando um projeto se aproxima ou ultrapassa o teto de remanejamento permitido. O uso é interno: acesso por senha única, sem cadastro de usuários.

Este projeto nasceu como fork podado do Financeme (controle financeiro pessoal), reaproveitando a base técnica — Next.js, Supabase, componentes de UI — e removendo todo o domínio de finanças pessoais que não se aplicava a orçamento institucional.

## A regra do teto de remanejamento

O valor total de um projeto é fixo e dividido entre as rubricas. Gastar menos do que o orçado numa rubrica é livre — a economia não gera crédito em lugar nenhum. Gastar mais do que o orçado numa rubrica é um excesso, e a soma de todos os excessos do projeto (nunca a diferença entre excessos e economias) fica limitada a um percentual configurável do valor total do projeto, por padrão 25%. Em outras palavras, uma rubrica que economizou não compensa outra que estourou: o teto incide sobre a soma bruta dos estouros, não sobre o saldo líquido do projeto.

## Stack

- Next.js 16 (App Router, build com Webpack)
- Supabase — apenas `@supabase/supabase-js` com service role; não há `@supabase/ssr` nem login de usuário, porque o controle de acesso é uma senha única de aplicativo, não uma conta por pessoa
- Tailwind CSS + componentes shadcn/ui
- Zod + React Hook Form nos formulários
- SheetJS e ExcelJS, cada um cobrindo a metade que o outro não cobre (ver abaixo)

## Leitura e escrita de planilhas: por que duas bibliotecas

O aplicativo usa duas bibliotecas de planilha para dois sentidos diferentes, e não é redundância — cada uma resolve um problema que a outra não resolve:

- **Leitura do razão (arquivo `.xlsx` exportado do sistema contábil) usa SheetJS**, vendorizado em `vendor/xlsx-0.20.3.tgz` e instalado como dependência local (`file:vendor/...`) em vez de vir do npm. O sistema contábil grava o XML interno do arquivo com um prefixo de namespace na tag de célula que é XML válido, mas o ExcelJS não abre essa variante — falha com "Cannot read properties of undefined (reading 'sheets')". O SheetJS lê o arquivo real sem ajuste nenhum.
- **Escrita do export (planilha de acompanhamento em três abas) usa ExcelJS.** O SheetJS só formata células — moeda, cor condicional, negrito — na edição paga (Pro); a edição gratuita não tem essa API. O ExcelJS formata células de graça, então é ele quem gera o arquivo que o usuário baixa.

Nenhuma das duas faz o papel da outra no código: o SheetJS nunca escreve arquivo, o ExcelJS nunca lê o razão importado.

## Idempotência do import

Reimportar o mesmo arquivo do razão não duplica lançamentos. Cada linha recebe uma `import_key` — hash SHA-256 de voucher, diário, conta, valor, data e descrição — e um índice único em `(project_id, import_key)` no banco garante que a mesma linha nunca entra duas vezes. O par Comprovante+Diário sozinho não bastava como chave: um mesmo documento contábil pode cobrir várias linhas do razão com a mesma conta e o mesmo valor, distinguidas só pela descrição — por exemplo, duas notas fiscais diferentes lançadas no mesmo comprovante — e usar só o par tratava essas linhas, incorretamente, como duplicatas.

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha as quatro:

- `SUPABASE_URL` — URL do projeto Supabase.
- Chave de service role do Supabase (nome da variável: `SUPABASE_SERVICE_ROLE_KEY`) — contorna Row Level Security e nunca deve chegar ao navegador; é lida só em Server Actions e Route Handlers, nos arquivos marcados com `import 'server-only'`.
- `APP_PASSWORD` — a senha única de acesso ao aplicativo, comparada em `/api/auth`.
- `SESSION_SECRET` — segredo usado para assinar o cookie de sessão (HMAC-SHA-256) depois do login. Sem relação com `APP_PASSWORD`: uma variável autentica, a outra assina a sessão resultante.

## Rodando localmente

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). A primeira tela pede a senha de acesso; depois disso a sessão fica no cookie `farol_session` por 30 dias.

Outros scripts:

```bash
npm run build    # build de produção (webpack)
npm run start    # servidor de produção
npm run lint     # eslint
npm test         # vitest
```

## Aplicando migrations

As migrations vivem em `supabase/migrations/` e não são aplicadas automaticamente — não há Supabase CLI configurado neste ambiente. Para aplicar, abra o SQL Editor do projeto no painel do Supabase e cole o conteúdo de cada arquivo, em ordem numérica:

1. `0001_initial_schema.sql`
2. `0002_import_key.sql`
3. `0003_app_settings.sql`

No momento, **`0003_app_settings.sql` está pendente** — ainda não foi aplicada em produção. Ela cria a tabela `app_settings`, que guarda os valores padrão de limite de remanejamento e limiar de aviso usados ao criar um projeto novo. Enquanto a tabela não existir, a leitura dessas configurações captura o erro da consulta e devolve os defaults do código (25% e 80%) em vez de propagar a falha — a tela de Configurações e o formulário de novo projeto continuam funcionando normalmente, só sem persistência dos valores até a migration ser aplicada.

## Acesso ao banco

Todo acesso ao Supabase acontece no servidor — Server Actions (`lib/actions/`) e Route Handlers (`app/api/`) criados a partir de um cliente admin com a chave de service role, protegido por `import 'server-only'` (o build falha se esse módulo for importado por um Client Component). Não existe cliente Supabase de navegador neste projeto: nenhum componente `'use client'` fala diretamente com o banco, e a chave de service role nunca é enviada ao navegador.

## Deploy na Vercel

O deploy não foi executado a partir deste ambiente — fica a cargo de quem tem acesso à conta Vercel. Os passos:

```bash
git config user.email seu-email@dominio.com   # ver aviso abaixo
npx vercel@latest link
npx vercel@latest env add SUPABASE_URL production
npx vercel@latest env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel@latest env add APP_PASSWORD production
npx vercel@latest env add SESSION_SECRET production
npx vercel@latest --prod
```

Repita os quatro `env add` trocando `production` por `preview` — sem isso, qualquer branch de preview quebra na primeira query ao Supabase.

**Atenção ao `git config user.email`**: o endereço configurado precisa ser um dos e-mails associados à conta Vercel de quem vai fazer o deploy. Um e-mail de commit que a Vercel não reconhece como membro do time faz o deploy sair com status `BLOCKED` mesmo com o build passando — a causa não aparece nos logs de build, só na tela de deployments.

Depois do deploy, confira no DevTools do navegador (aba Network) que nenhuma resposta contém a chave de service role nem a string `service_role` — é a checagem de que a chave ficou só no servidor.

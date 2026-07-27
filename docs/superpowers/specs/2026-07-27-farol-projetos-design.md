# Farol de Projetos — Design

**Data:** 2026-07-27
**Status:** aprovado, pronto para plano de implementação
**Base:** fork do Financeme (`~/projetos/financeiro`)
**Pasta:** `~/projetos/farol-projetos`

---

## 1. Problema

Projetos institucionais do SESI-AL têm valor total fixo e orçamento distribuído por rubrica. A
execução real acontece num sistema contábil externo (Genus/Dynamics), de onde se extrai o razão em
`.xlsx`. Hoje não existe visão consolidada de orçado × realizado por rubrica, nem controle do limite
de remanejamento entre rubricas — que é a regra que, se violada, exige aditivo.

O Farol de Projetos cadastra o projeto e suas rubricas, importa o razão, e mostra a qualquer momento
quanto ainda há disponível, quanto já foi gasto por rubrica, e quanto do teto de remanejamento já
foi consumido.

## 2. Regra de negócio central

O valor total do projeto é fixo. Cada rubrica tem um valor orçado. Gastar **menos** que o orçado numa
rubrica é livre. Gastar **mais** é remanejamento, e a soma de todos os remanejamentos é limitada a um
percentual do valor total do projeto — 25% por padrão, configurável por projeto.

```
realizado(rubrica)  = Σ lançamentos kind ∈ (despesa, manual) da rubrica + descendentes
excesso(rubrica)    = max(0, realizado − orçado)
remanejado          = Σ excesso de todas as rubricas de controle
teto                = total_budget × transfer_limit_pct / 100
consumo_do_teto     = remanejado / teto

aviso     quando consumo_do_teto ≥ warning_threshold_pct  (padrão 80%)
violação  quando remanejado > teto  ou  Σ realizado > total_budget
```

Economia numa rubrica **não abate** o excesso de outra no cálculo — só o excesso conta. O denominador
é sempre o valor total do projeto, nunca o valor da rubrica.

**Exemplo.** Projeto de R$ 100, dez rubricas de R$ 10, limite 25% → teto de R$ 25. Passagens gasta 22
(excesso 12), Hospedagem gasta 18 (excesso 8), as demais economizam. Remanejado = 20, consumo do teto
= 80% → dispara o aviso.

### Nível de controle

Uma rubrica é **nível de controle** quando tem `budgeted_amount` preenchido. Rubricas filhas de um
grupo ficam com `budgeted_amount = null` e apenas detalham o realizado do pai. O cálculo de excesso
percorre somente rubricas de controle, o que elimina dupla contagem sem exigir regra implícita de
hierarquia.

### Rubrica sem orçamento

Uma rubrica com gasto e sem `budgeted_amount` **não gera excesso**. Tratá-la como orçado zero faria
todo o gasto virar excesso e inflaria o consumo do teto falsamente. Em vez disso, o dashboard exibe
aviso próprio — *"N rubricas com gasto e sem orçamento definido — cálculo do teto incompleto"* — até
que o valor seja preenchido.

### Baixa de projeto

O razão traz lançamentos em contas iniciadas em `4` com valor negativo (ex.: `41020304001 — Projetos
Estratégicos`, R$ −41.156,24, descrição "BAIXA DE PROJETOS"). São a contrapartida contábil, não
despesa. Entram como `kind='baixa'`: importadas e visíveis na listagem, mas **fora** do realizado e
fora do cálculo do teto. Incluí-las faria o gasto do projeto-exemplo aparecer como R$ 7 mil em vez de
R$ 48 mil.

## 3. Modelo de dados

Supabase novo (não reaproveita o do Financeme). Migration `0001_initial_schema.sql`.

```sql
projects
  id                     uuid pk
  code                   text unique      -- "30413070101", o Centro do razão; chave de match no import
  name                   text not null
  total_budget           numeric(14,2) not null
  start_date, end_date   date
  status                 text check in ('planejamento','ativo','encerrado')
  transfer_limit_pct     numeric(5,2) not null default 25
  warning_threshold_pct  numeric(5,2) not null default 80
  notes                  text
  created_at, updated_at timestamptz

budget_lines                            -- rubricas, auto-referenciada
  id                     uuid pk
  project_id             uuid fk → projects on delete cascade
  parent_id              uuid fk → budget_lines on delete set null
  code                   text            -- "31010401001", a Conta do razão; null em grupo manual
  name                   text not null
  budgeted_amount        numeric(14,2)   -- null = não é nível de controle
  sort_order             integer not null default 0
  created_at, updated_at timestamptz
  unique (project_id, code)

ledger_entries                          -- lançamentos
  id                     uuid pk
  project_id             uuid fk → projects on delete cascade
  budget_line_id         uuid fk → budget_lines on delete set null   -- null = não classificado
  entry_date             date not null
  amount                 numeric(14,2) not null
  kind                   text check in ('despesa','baixa','manual')
  description            text
  account_code           text
  account_name           text
  cost_center_code       text
  voucher                text            -- Comprovante
  journal                text            -- Diário
  document, reference    text
  vendor_doc             text            -- CNPJ/CPF
  vendor_name            text            -- RAZÃO SOCIAL/NOME
  payment_date           date
  document_date          date
  urls                   jsonb           -- { requisicao, recebimento, nota_fiscal, comprovante }
  source                 text check in ('import','manual')
  import_batch_id        uuid fk → import_batches on delete set null
  raw                    jsonb           -- linha original, para auditoria
  created_at, updated_at timestamptz

  unique (project_id, voucher, journal) where source = 'import'

import_batches
  id                     uuid pk
  project_id             uuid fk → projects on delete cascade
  filename               text not null
  imported_at            timestamptz not null default now()
  rows_read              integer not null
  rows_inserted          integer not null
  rows_duplicate         integer not null
  rows_unmapped          integer not null
```

Não há coluna de status: o batch só é gravado no commit, então todo registro existente é confirmado.

Índices: `budget_lines(project_id)`, `budget_lines(parent_id)`, `ledger_entries(project_id, entry_date)`,
`ledger_entries(budget_line_id)`, `ledger_entries(import_batch_id)`.

RLS habilitada em todas as tabelas **sem nenhuma policy** — deny-all para `anon` e `authenticated`. O
acesso é exclusivamente pela service role key, sempre server-side.

## 4. Importação do razão

Módulo puro em `lib/domain/ledger-import.ts`: recebe um `Buffer`, devolve estrutura tipada. Não
conhece Supabase, o que o torna inteiramente testável.

**Formato de origem** — `.xlsx` gerado pelo Genus/Dynamics, cabeçalho na linha 1, 23 colunas:
`Data, Entidade, Filial, Unidade, Centro, Conta, Valor, Comprovante, Diário, Data_do_Pagamento,
Data do Documento, Descrição, Texto de linha, Referência, CNPJ/CPF, RAZÃO SOCIAL/NOME, Requisição,
URL Requisição, Recebimento, URL Recebimento, Documento, URL Nota Fiscal, URL Comprovante`.

**Regras do parser:**

- Linhas com `Centro` vazio são rodapé do relatório (linha `Total` e linha `Filtros aplicados:`) e são
  descartadas.
- `Data` e `Data do Documento` vêm como texto `dd/MM/yyyy`.
- `Valor` é numérico, podendo ser negativo.
- `Centro` e `Conta` vêm no formato `código - descrição` (ex.: `31010401001 - Passagens Nacionais`).
  O parser separa no primeiro ` - `: o código vira a chave de match e a descrição vira o nome.
- O projeto vem do `Centro`: o código casa com `projects.code`.
- A rubrica vem da `Conta`: o código casa com `budget_lines.code`, a descrição vira `account_name`.
- Conta iniciada em `4` com valor negativo → `kind='baixa'`. Demais → `kind='despesa'`.
- Conta inexistente no projeto → cria `budget_lines` com `budgeted_amount = null` e incrementa
  `rows_unmapped`.
- Um arquivo pode conter vários centros: o preview agrupa por projeto. Centro sem projeto cadastrado
  aparece como bloco ignorado, com ação de criar o projeto na hora.

**Idempotência** — a constraint `unique (project_id, voucher, journal) where source='import'` garante
que reimportar o mesmo arquivo insere zero linhas. O import é sempre incremental e nunca remove
lançamentos já gravados.

**Fluxo em duas etapas** — nada é gravado antes da confirmação:

1. `POST /api/import` — recebe o arquivo, parseia, resolve projetos e rubricas, devolve o preview.
2. `POST /api/import/commit` — grava lançamentos, rubricas novas e o `import_batch`.

Preview exibido ao usuário:

```
Arquivo: data.xlsx
Projeto detectado: 30413070101 — Estruturante 2026 ✓

  32 lançamentos novos            R$ 48.419,11
   4 duplicados (já importados)    — ignorados
   1 baixa de projeto             R$ -41.156,24
   2 rubricas novas sem orçamento  ⚠

[ Cancelar ]  [ Confirmar import ]
```

**Biblioteca** — ExcelJS, em Route Handler Node.js. Serve tanto para ler quanto para escrever, o que
evita uma segunda dependência no export.

## 5. Exportação

`GET /api/export?projeto=<id>&formato=xlsx|csv`, também via ExcelJS.

O `.xlsx` traz três abas:

1. **Resumo por rubrica** — código, rubrica, orçado, realizado, saldo, excesso, % execução
2. **Lançamentos** — todas as colunas, incluindo URLs de nota fiscal e comprovante
3. **Indicadores** — total, realizado, saldo, remanejado, teto, % de consumo do teto

O `.csv` exporta apenas a aba de resumo.

## 6. Telas

| Rota | Conteúdo |
|---|---|
| `/` | Lista de projetos: card com barra de execução e badge de alerta |
| `/projetos/novo` · `/projetos/[id]/editar` | Total, período, status, limite de remanejamento %, limiar de aviso % |
| `/projetos/[id]` | Dashboard: KPIs (Orçamento, Realizado, Saldo, Consumo do teto), medidor do teto, tabela de rubricas em árvore, barras orçado × realizado |
| `/projetos/[id]/rubricas` | Definir orçado, criar grupo, mover rubrica para dentro de um grupo |
| `/projetos/[id]/lancamentos` | Tabela com filtros (rubrica, período, fornecedor, tipo, texto), editar, reclassificar, criar manual |
| `/projetos/[id]/importar` | Upload, preview e histórico de batches |
| `/configuracoes` | Padrões de limite % e limiar de aviso para projetos novos |

## 7. Autenticação

Sem contas de usuário. Uma senha única do aplicativo:

- `APP_PASSWORD` e `SESSION_SECRET` em variáveis de ambiente.
- `POST /api/auth` valida a senha e seta cookie `farol_session` httpOnly, assinado com HMAC.
- `proxy.ts` (o middleware do Next.js 16) barra todas as rotas exceto `/login` e `/api/auth`.
- `SUPABASE_SERVICE_ROLE_KEY` nunca chega ao browser.

Consequência arquitetural relevante: o Financeme faz mutations direto do browser, com
`createClient` de `lib/supabase/client.ts` dentro dos `_view.tsx`. Esse padrão é incompatível com
service role key. No Farol, os `_view.tsx` mantêm o mesmo estilo de filtros, ordenação e estado local,
mas toda mutação passa a chamar **Server Actions**. O arquivo `lib/supabase/client.ts` não é
reaproveitado.

## 8. Fork do Financeme

Copiar `~/projetos/financeiro` para `~/projetos/farol-projetos`, sem o `.git`.

**Remover:**

- `app/(app)/{cards,installments,shopping,forecast}`
- `app/(auth)`, `app/callback`
- `components/cards/`
- `components/forms/{card-form,installment-group-form,shopping-form,transaction-form,bulk-transactions-form}.tsx`
- `lib/domain/{card-fatura-composition,card-faturas,billing,installments}.ts` e o teste correspondente
- `lib/seed.ts`, `lib/seed-data.ts`
- `lib/supabase/client.ts`, `lib/supabase/middleware.ts`
- `supabase/migrations/*`

**Manter:**

- `components/ui/` (19 componentes Base UI/shadcn)
- `components/layout/` — `year-switcher` é reescrito como seletor de projeto
- `components/pivot-table.tsx`, `components/charts/`, `components/calculator-fab.tsx`
- `lib/format.ts`, `lib/utils.ts`, `lib/supabase/server.ts`
- Padrão `page.tsx` (server, busca dados) + `_view.tsx` (client, interação)
- `vitest.config.ts`, configuração Tailwind 4, `components.json`, `AGENTS.md`

## 9. Testes

Vitest sobre a lógica pura, que concentra o risco.

`lib/domain/ledger-import.test.ts`
- descarta a linha `Total` e a linha `Filtros aplicados:`
- identifica baixa por conta iniciada em `4` com valor negativo
- parseia `dd/MM/yyyy` e valores negativos
- deduplica por `Comprovante` + `Diário`
- separa corretamente um arquivo com múltiplos centros
- reporta contas sem rubrica correspondente em `rows_unmapped`

`lib/domain/budget-alerts.test.ts`
- excesso por rubrica, ignorando economia
- soma do remanejado e consumo do teto
- rubrica sem orçamento fica fora do cálculo e gera aviso próprio
- hierarquia pai/filha sem dupla contagem
- limites customizados por projeto (diferentes de 25/80)
- violação quando remanejado > teto e quando realizado > total do projeto

O arquivo `~/Downloads/data.xlsx` serve de fixture real para os testes de import.

## 10. Stack

Herdada do Financeme: Next.js 16.2.4 (App Router, `proxy.ts`), React 19.2, TypeScript, Tailwind 4,
Base UI + shadcn, Recharts, React Hook Form + Zod, Sonner, Vitest. Acrescenta ExcelJS. Banco em
Supabase novo, deploy na Vercel.

## 11. Fora de escopo nesta versão

- Contas de usuário, papéis e compartilhamento por projeto
- Reconciliação que detecta lançamentos removidos do razão (o import é só incremental)
- Fluxo de aprovação de remanejamento e geração de aditivo
- Anexo de arquivos próprio (as URLs do Genus já são referenciadas)
- Importação de outros formatos além do `.xlsx` do Genus

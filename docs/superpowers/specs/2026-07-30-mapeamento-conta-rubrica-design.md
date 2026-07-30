# Mapeamento conta do razão ↔ rubrica (de/para) — design

**Data:** 2026-07-30
**Status:** desenhado, aguardando plano de implementação

## 1. Problema

O import do razão contábil (`resolveImport`, em `lib/domain/import-resolution.ts`) casa cada
lançamento com uma rubrica **só se a conta do razão bater exatamente com o `code` de uma
`budget_line` já cadastrada**. Quando não bate — e hoje nunca bate, porque as rubricas são
cadastradas com o nome do SGF (`Técnicos Especializados`, `Material Didático`...) e não com o
código da conta do Genus (`3.1.1.05.002`) — a conta some para dentro de `newBudgetLines` e é
**criada como rubrica nova, automaticamente, sem perguntar nada a ninguém**, no commit do import
(`app/api/import/commit/route.ts`).

O resultado prático: cada conta distinta do razão vira sua própria rubrica, uma pra cada uma,
mesmo quando várias contas do plano de contas do Genus correspondem à mesma categoria de gasto do
SGF (ex.: duas contas de consultoria diferentes que deveriam cair as duas em "Técnicos
Especializados"). Isso quebra o teto de remanejamento por rubrica — que é o motivo de existir o
controle `por_rubrica` — porque a rubrica deixa de refletir a categoria orçada no SGF e passa a
refletir o plano de contas contábil, que tem uma granularidade diferente.

Não existe hoje nenhuma tela ou tabela que registre "essa conta corresponde a essa rubrica". A
tela de preview do import (`ProjectPlanCard`, dentro de `_view.tsx`) mostra as contas novas numa
caixa âmbar só como aviso passivo — o usuário aceita ou cancela o import inteiro, não redireciona
conta nenhuma para uma rubrica já existente.

## 2. O que a feature faz

Um mapeamento **por projeto**, de **N contas do razão para 1 rubrica** (uma rubrica pode receber
várias contas; uma conta, dentro de um projeto, sempre aponta para a mesma rubrica — decisão
confirmada com o usuário, não há ambiguidade a resolver por lançamento). Duas portas de entrada
para o mesmo dado:

1. **Página de mapeamento manual**, onde o gestor pode digitar de antemão "a conta X corresponde à
   rubrica Y" — útil porque os 4 projetos cadastrados em 2026-07-30 (Serenamente, Indústria Viva,
   Fábrica de Histórias, Corrida) ainda não têm nenhum razão importado, e o gestor pode já saber
   o plano de contas do Genus de cor.
2. **Resolução dentro do próprio import**: quando uma conta não tem mapeamento salvo, a tela de
   preview passa a perguntar "essa conta corresponde a qual rubrica?" em vez de criar uma rubrica
   nova sozinha. A resposta é salva como mapeamento — o próximo import da mesma conta já resolve
   sozinho.

Escopo é sempre por projeto: cada projeto tem seu próprio conjunto de rubricas (já é assim hoje) e
seu próprio conjunto de mapeamentos. Não existe plano de contas institucional compartilhado entre
projetos nesta versão — cada projeto reaprende o próprio mapeamento, mesmo que a conta do razão se
repita entre projetos diferentes.

## 3. Schema

Migration `0012_budget_line_account_mappings.sql`:

```sql
create table budget_line_account_mappings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  account_code text not null,
  account_name text,
  budget_line_id uuid not null references budget_lines (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (project_id, account_code)
);
create index budget_line_account_mappings_line_idx
  on budget_line_account_mappings (budget_line_id);

alter table budget_line_account_mappings enable row level security;
notify pgrst, 'reload schema';
```

O índice único em `(project_id, account_code)` é o que garante o N:1: uma conta não pode apontar
para duas rubricas dentro do mesmo projeto. Tentar cadastrar uma conta já mapeada para outra
rubrica é erro de validação, não um segundo mapeamento silencioso.

`account_name` é só informativo — ajuda a reconhecer a conta na página de mapeamento sem precisar
ter importado nada ainda. Fica nulo quando o gestor cadastra o mapeamento manualmente sem saber o
nome exato da conta.

`budget_lines.code` (campo já existente, hoje sem uso nos 4 projetos novos) não é alterado nem
descontinuado. Projetos que já dependem dele continuam funcionando — ver seção 4, passo 2.

## 4. Mudança em `resolveImport`

`ResolutionContext` ganha um campo novo:

```ts
mappingsByProject: Record<string, { accountCode: string; budgetLineId: string }[]>;
```

Populado pela rota `/api/import` com uma consulta a `budget_line_account_mappings` para os
projetos identificados no arquivo, do mesmo jeito que já busca `budget_lines` e `ledger_entries`
existentes.

Dentro do loop de `resolveImport`, a resolução da rubrica passa a seguir esta ordem:

1. **Existe mapeamento salvo** para `(project_id, entry.accountCode)`? Usa o `budget_line_id`
   mapeado.
2. **Não existe mapeamento, mas `budget_lines.code` bate direto** com `entry.accountCode`? Mantém
   — é o que sustenta projetos que já dependiam do casamento direto (nenhum dos 4 novos depende
   disso hoje, mas não custa preservar o caminho).
3. **Nenhum dos dois bate.** A conta entra em `unmappedAccounts` (renomeia `newBudgetLines`, que
   deixa de significar "vai virar rubrica nova automaticamente" e passa a significar "precisa de
   uma decisão").

`ProjectPlan.newBudgetLines` é removido; `ProjectPlan.unmappedAccounts: { code: string; name:
string }[]` toma o lugar. O array não é mais gravado direto no commit — vira insumo da tela de
resolução (seção 5).

## 5. Tela de import — de aviso passivo a decisão

Hoje, `ProjectPlanCard` mostra uma caixa âmbar: *"Rubricas novas sem orçamento — serão criadas"*,
listando código e nome de cada conta não mapeada. Essa caixa vira um formulário: para cada item de
`unmappedAccounts`, um seletor com duas opções —

- **Mapear para uma rubrica existente** deste projeto (lista as `budget_lines` já cadastradas).
- **Criar rubrica nova** com o nome da conta (comportamento antigo, mas agora é escolha explícita,
  não default silencioso).

O botão "Confirmar import" fica desabilitado enquanto existir conta sem decisão. Cancelar continua
só limpando o estado local, sem chamada de rede — isso não muda.

O payload de `POST /api/import/commit` ganha o campo `resolutions`:

```ts
type Resolution =
  | { accountCode: string; action: 'existing'; budgetLineId: string }
  | { accountCode: string; action: 'create'; name: string };
```

Como as rotas de import hoje não têm validação Zod (achado da investigação — destoa do resto do
app, que valida tudo com Zod + Server Action), este payload novo ganha um schema Zod local à rota,
sem reescrever a validação manual já existente ao redor dele. Não é o momento de migrar as duas
rotas inteiras para Server Actions — foge do escopo desta feature.

No commit, para cada resolução:

- `action: 'existing'` — grava um registro em `budget_line_account_mappings`
  (`account_code`, `account_name` vindo do arquivo, `budget_line_id` escolhido) e os lançamentos
  dessa conta entram classificados nessa rubrica.
- `action: 'create'` — cria a `budget_line` **sem `code`** (o código não vive mais em
  `budget_lines.code` para rubricas nascidas desse fluxo; vive só na tabela de mapeamento) e grava
  o mapeamento imediatamente, apontando para a rubrica recém-criada. O próximo import da mesma
  conta já resolve sozinho, sem perguntar de novo.

## 6. Página de mapeamento manual

Rota nova `/projetos/[id]/financeiro/mapeamento`, um botão a mais ao lado de
Rubricas / Lançamentos / Importar (mesma barra que já existe em `/financeiro`).

Mostra as rubricas do projeto, cada uma com a lista de contas do razão já mapeadas a ela. Formulário
de adição: código da conta (obrigatório), nome da conta (opcional, só para referência), rubrica de
destino (select das `budget_lines` do projeto). Cada conta mapeada tem um "×" que remove o vínculo
— remover não toca nos `ledger_entries` já importados com aquela classificação, só deixa de valer
para importações futuras da mesma conta.

Zod schema (`lib/actions/mapping-schema.ts`) e Server Actions (`lib/actions/mapping-mutations.ts`:
`createMapping`, `deleteMapping`) seguem o padrão já usado por `budget-line-schema.ts` /
`budget-lines-mutations.ts` — diferente das rotas de import, esta página é feature nova e não tem
motivo para fugir do padrão do resto do app.

## 7. Fora de escopo nesta versão

- **Mapeamento institucional compartilhado entre projetos.** Cada projeto tem seu próprio conjunto
  de mapeamentos, mesmo que a mesma conta do Genus apareça em vários projetos. Se isso se provar
  repetitivo na prática, um mapeamento "padrão" herdável fica para uma versão futura.
- **Reclassificação retroativa** das rubricas que já nasceram 1:1 com conta em projetos antigos
  (340252, "Estruturante 2026 — Capacitações e Treinamentos"). Essas rubricas continuam existindo
  como estão; a feature não migra dados históricos.
- **Resolução ambígua por lançamento** (a mesma conta apontando para rubricas diferentes dentro do
  mesmo projeto, dependendo do lançamento específico). O usuário confirmou que isso não acontece
  na prática — cada conta é determinística dentro do projeto.
- **Migrar `app/api/import` e `app/api/import/commit` de Route Handler para Server Action.** É uma
  divergência real do padrão do app, mas não é bloqueio desta feature — fica registrada aqui como
  débito técnico observado, não como trabalho desta spec.

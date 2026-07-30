# Mapeamento conta do razão ↔ rubrica (de/para) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o import do razão parar de criar uma rubrica nova para cada conta contábil desconhecida e, em vez disso, resolver contra um mapeamento salvo (N contas → 1 rubrica, por projeto) — com uma tela para cadastrar esse mapeamento na mão e uma resolução guiada dentro do próprio fluxo de import.

**Architecture:** Uma tabela nova (`budget_line_account_mappings`) guarda o vínculo; a função pura `resolveImport` passa a consultá-la antes de propor rubrica nova; as duas rotas de import (preview e commit) e a tela cliente ganham o campo `resolutions`/UI de decisão; uma página nova sob `/financeiro/mapeamento` expõe CRUD do mapeamento seguindo o padrão Zod + Server Action já usado por rubricas.

**Tech Stack:** Next.js 16 (Route Handlers + Server Actions), Supabase (Postgres via `createAdminClient`, service role), Zod, React Hook Form, Vitest.

## Global Constraints

- Repositório: `~/projetos/farol-projetos`. Leia `AGENTS.md` antes de mexer em qualquer arquivo — a versão do Next.js instalada tem breaking changes em relação ao treino do modelo; consulte `node_modules/next/dist/docs/` antes de usar qualquer API do framework que pareça familiar.
- Sem Server Component com `'use server'` misturando export de tipo/valor não-função — schema Zod e tipos vivem em arquivo `*-schema.ts` sem a diretiva; as Server Actions vivem em `*-mutations.ts` com `'use server'`; um arquivo `*.ts` sem diretiva reexporta os dois (padrão de `lib/actions/budget-lines.ts`).
- Toda mutação via Supabase usa `createAdminClient()` (`lib/supabase/admin.ts`) — nunca cliente de browser.
- Migrations em `supabase/migrations/` **não são aplicadas automaticamente**: depois de criar o arquivo `.sql`, é preciso abrir o SQL Editor do painel do Supabase e colar o conteúdo manualmente.
- Testes: `npm test` (vitest run). Só a camada de domínio (`lib/domain/*.test.ts`) e de schema Zod (`lib/actions/*-schema.test.ts`) tem testes unitários hoje — Server Actions que chamam `createAdminClient()` não são testadas (não há mock de Supabase no projeto); siga essa convenção, não introduza mocks novos.
- Build completo (typecheck + lint incluso no Next): `npm run build`.

---

## Arquivos afetados

| Arquivo | Ação |
|---|---|
| `supabase/migrations/0012_budget_line_account_mappings.sql` | criar |
| `lib/supabase/types.ts` | modificar (novo Row/Insert + registro em `Database`) |
| `lib/domain/import-resolution.ts` | modificar |
| `lib/domain/import-resolution.test.ts` | modificar |
| `app/api/import/route.ts` | modificar |
| `app/api/import/commit/route.ts` | modificar |
| `app/(app)/projetos/[id]/financeiro/importar/_view.tsx` | modificar |
| `lib/actions/mapping-schema.ts` | criar |
| `lib/actions/mapping-schema.test.ts` | criar |
| `lib/actions/mapping-mutations.ts` | criar |
| `lib/actions/mapping.ts` | criar |
| `app/(app)/projetos/[id]/financeiro/mapeamento/page.tsx` | criar |
| `app/(app)/projetos/[id]/financeiro/mapeamento/_view.tsx` | criar |
| `app/(app)/projetos/[id]/financeiro/_view.tsx` | modificar (botão de navegação) |

---

### Task 1: Migration e tipos do Supabase

**Files:**
- Create: `supabase/migrations/0012_budget_line_account_mappings.sql`
- Modify: `lib/supabase/types.ts`

**Interfaces:**
- Produces: tabela `budget_line_account_mappings(id, project_id, account_code, account_name, budget_line_id, created_at)` com índice único `(project_id, account_code)`; tipos `BudgetLineAccountMappingRow` e `BudgetLineAccountMappingInsert` exportados de `lib/supabase/types.ts`; entrada `budget_line_account_mappings` em `Database['public']['Tables']`.

- [ ] **Step 1: Criar a migration**

Escreva em `supabase/migrations/0012_budget_line_account_mappings.sql`:

```sql
-- Farol de Projetos — mapeamento conta do razão -> rubrica (2026-07-30)
--
-- O import do razão hoje casa cada lançamento com uma rubrica só quando a
-- conta do Genus bate exatamente com o `code` de uma budget_line. Quando não
-- bate, o import cria uma rubrica nova automaticamente — o que quebra o
-- controle por rubrica quando várias contas do plano de contas do Genus
-- deveriam cair na mesma categoria orçada no SGF (ex.: duas contas de
-- consultoria diferentes que são as duas "Técnicos Especializados").
--
-- Esta tabela guarda esse de/para por projeto: N contas do razão apontam
-- para 1 rubrica. O índice único em (project_id, account_code) garante que,
-- dentro de um projeto, uma conta nunca aponta para duas rubricas ao mesmo
-- tempo — resolução é sempre determinística.

create table budget_line_account_mappings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  account_code text not null,
  -- Só informativo — ajuda a reconhecer a conta na tela de mapeamento sem
  -- precisar ter importado nada ainda. Fica nulo quando o gestor cadastra o
  -- mapeamento na mão sem saber o nome exato da conta.
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

- [ ] **Step 2: Aplicar a migration no Supabase**

Abra o SQL Editor do projeto Supabase (`pseksrhwsgfoyackzahb`, conforme `~/projetos/farol-projetos/.env.local` → `SUPABASE_URL`) e cole o conteúdo do arquivo acima. Rode.

Verifique que a tabela existe rodando, no mesmo SQL Editor:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'budget_line_account_mappings'
order by ordinal_position;
```

Esperado: 6 linhas (`id`, `project_id`, `account_code`, `account_name`, `budget_line_id`, `created_at`).

- [ ] **Step 3: Adicionar os tipos em `lib/supabase/types.ts`**

Depois da definição de `BudgetLineRow` (linha 59) e antes de `LedgerEntryRow`, adicione:

```ts
export type BudgetLineAccountMappingRow = {
  id: string;
  project_id: string;
  account_code: string;
  account_name: string | null;
  budget_line_id: string;
  created_at: string;
};
```

Depois da linha `export type BudgetLineInsert = ...` (linha 203), adicione:

```ts
export type BudgetLineAccountMappingInsert = Omit<
  BudgetLineAccountMappingRow,
  'id' | 'created_at'
>;
```

Na seção `Database.public.Tables` (a partir da linha 224), adicione uma linha depois de `budget_lines`:

```ts
      budget_lines:   { Row: BudgetLineRow;   Insert: BudgetLineInsert;   Update: BudgetLineUpdate;  Relationships: [] };
      budget_line_account_mappings: { Row: BudgetLineAccountMappingRow; Insert: BudgetLineAccountMappingInsert; Update: never; Relationships: [] };
```

(Sem tipo de `Update`: mapeamento não se edita, só se cria e se exclui — refletido como `never`.)

- [ ] **Step 4: Verificar que compila**

Run: `cd ~/projetos/farol-projetos && npx tsc --noEmit`
Expected: sem erros novos relacionados a `types.ts` (erros pré-existentes no repo, se houver, não são deste passo).

- [ ] **Step 5: Commit**

```bash
cd ~/projetos/farol-projetos
git add supabase/migrations/0012_budget_line_account_mappings.sql lib/supabase/types.ts
git commit -m "Add budget_line_account_mappings table and types"
```

---

### Task 2: Domínio — `resolveImport` passa a consultar o mapeamento

**Files:**
- Modify: `lib/domain/import-resolution.ts`
- Modify: `lib/domain/import-resolution.test.ts`

**Interfaces:**
- Consumes: nenhuma (função pura de domínio).
- Produces: `ResolutionContext` com campo novo `mappingsByProject: Record<string, { accountCode: string; budgetLineId: string }[]>`; `ProjectPlan.unmappedAccounts: { code: string; name: string }[]` (renomeado de `newBudgetLines`); `ProjectPlan.existingBudgetLines: { id: string; code: string | null; name: string }[]` (novo — a lista de rubricas do projeto, para a UI montar o seletor de resolução). `budgetLinesByProject` ganha `name` em cada item.

- [ ] **Step 1: Atualizar os fixtures do teste existente para o shape novo**

Em `lib/domain/import-resolution.test.ts`, troque a declaração de `context` (linhas 29-39) por:

```ts
const context: ResolutionContext = {
  projectsByCode: {
    '30413070101': { id: 'proj-1', name: 'Estruturante 2026' },
  },
  budgetLinesByProject: {
    'proj-1': [{ id: 'line-1', code: '31010401001', name: 'Passagens Nacionais' }],
  },
  existingKeysByProject: {
    'proj-1': [],
  },
  mappingsByProject: {
    'proj-1': [],
  },
};
```

Depois, troque toda ocorrência de `newBudgetLines` no arquivo por `unmappedAccounts` (são 4 ocorrências: linhas 48, 95, 98, 105 — mais as dos testes das linhas 151 e 160, que também usam `newBudgetLines`). Ao todo são estas asserções a renomear:

```ts
    expect(plan.projects[0].newBudgetLines).toHaveLength(0);
```
vira
```ts
    expect(plan.projects[0].unmappedAccounts).toHaveLength(0);
```

```ts
    expect(plan.projects[0].newBudgetLines).toEqual([
      { code: '31010403001', name: 'Hospedagens' },
    ]);
```
vira
```ts
    expect(plan.projects[0].unmappedAccounts).toEqual([
      { code: '31010403001', name: 'Hospedagens' },
    ]);
```

```ts
    expect(plan.projects[0].newBudgetLines).toHaveLength(1);
```
(aparece duas vezes, nos testes "propõe cada rubrica nova uma única vez" e "aporte não cria rubrica...", e "despesa continua criando rubrica quando a conta é nova") vira, nas três ocorrências:
```ts
    expect(plan.projects[0].unmappedAccounts).toHaveLength(1);
```
— exceto no teste do aporte, onde o valor esperado é `0`:
```ts
    expect(plan.projects[0].unmappedAccounts).toHaveLength(0);
```

- [ ] **Step 2: Adicionar os testes novos do mapeamento (falhando)**

No fim do arquivo, antes do `});` que fecha o `describe`, adicione:

```ts
  it('usa o mapeamento salvo mesmo quando o código da conta não bate com nenhuma rubrica', () => {
    const ctx: ResolutionContext = {
      ...context,
      mappingsByProject: {
        'proj-1': [{ accountCode: '99988877', budgetLineId: 'line-1' }],
      },
    };
    const mapeada = entry({ accountCode: '99988877', accountName: 'Consultoria Jurídica' });
    const plan = resolveImport([mapeada], ctx);
    expect(plan.projects[0].newEntries[0].budgetLineId).toBe('line-1');
    expect(plan.projects[0].unmappedAccounts).toHaveLength(0);
    expect(plan.projects[0].unmappedCount).toBe(0);
  });

  it('duas contas mapeadas para a mesma rubrica não geram conta não mapeada', () => {
    const ctx: ResolutionContext = {
      ...context,
      mappingsByProject: {
        'proj-1': [
          { accountCode: '11122233', budgetLineId: 'line-1' },
          { accountCode: '44455566', budgetLineId: 'line-1' },
        ],
      },
    };
    const a = entry({ accountCode: '11122233', accountName: 'Consultoria Jurídica', voucher: 'C1' });
    const b = entry({ accountCode: '44455566', accountName: 'Consultoria Contábil', voucher: 'C2' });
    const plan = resolveImport([a, b], ctx);
    expect(plan.projects[0].newEntries[0].budgetLineId).toBe('line-1');
    expect(plan.projects[0].newEntries[1].budgetLineId).toBe('line-1');
    expect(plan.projects[0].unmappedAccounts).toHaveLength(0);
  });

  it('expõe as rubricas existentes do projeto no plano, para a tela de resolução', () => {
    const plan = resolveImport([entry()], context);
    expect(plan.projects[0].existingBudgetLines).toEqual([
      { id: 'line-1', code: '31010401001', name: 'Passagens Nacionais' },
    ]);
  });
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `cd ~/projetos/farol-projetos && npm test -- import-resolution`
Expected: FAIL — `mappingsByProject` não existe no tipo `ResolutionContext`, `unmappedAccounts`/`existingBudgetLines` não existem em `ProjectPlan` (erros de tipo/runtime, a suite não compila ainda).

- [ ] **Step 4: Implementar a mudança em `import-resolution.ts`**

Substitua o arquivo inteiro por:

```ts
import { createHash } from 'node:crypto';
import type { ParsedEntry } from './ledger-import';

export type ResolutionContext = {
  /** Indexado pelo código do centro de custo. */
  projectsByCode: Record<string, { id: string; name: string }>;
  /** Rubricas já cadastradas, por projeto. */
  budgetLinesByProject: Record<string, { id: string; code: string | null; name: string }[]>;
  /** Valores de `import_key` já gravados, por projeto. */
  existingKeysByProject: Record<string, string[]>;
  /** Mapeamento conta do razão -> rubrica, por projeto. Ver migração 0012. */
  mappingsByProject: Record<string, { accountCode: string; budgetLineId: string }[]>;
};

/** Conta do razão sem rubrica correspondente — precisa de uma decisão (rubrica existente ou nova). */
export type UnmappedAccount = { code: string; name: string };

export type PlannedEntry = ParsedEntry & {
  /** Código da conta que resolve a rubrica. Pode apontar para rubrica ainda a criar. */
  budgetLineCode: string;
  /** id da rubrica quando ela já existe; null quando será criada no commit. */
  budgetLineId: string | null;
  /** Hash de idempotência gravado em ledger_entries.import_key. */
  importKey: string | null;
};

export type ProjectPlan = {
  projectId: string;
  projectName: string;
  centerCode: string;
  newEntries: PlannedEntry[];
  /** Contas sem rubrica correspondente — a UI de import decide o destino de cada uma. */
  unmappedAccounts: UnmappedAccount[];
  /** Rubricas já cadastradas do projeto — a UI usa para montar o seletor de resolução. */
  existingBudgetLines: { id: string; code: string | null; name: string }[];
  duplicateCount: number;
  unmappedCount: number;
  expenseTotal: number;
  /** Total de aportes recebidos no arquivo, positivo. */
  contributionTotal: number;
};

export type UnknownCenter = {
  code: string;
  name: string;
  count: number;
  total: number;
};

export type ImportPlan = {
  projects: ProjectPlan[];
  unknownCenters: UnknownCenter[];
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Chave de idempotência do lançamento no razão.
 *
 * Comprovante+Diário NÃO bastam: um documento cobre várias linhas. No arquivo
 * real o CONTAB000200813 tem 9 linhas, duas com a mesma conta e o mesmo valor
 * (R$ 7.795,41 em Passagens), separadas só pela descrição — NF 180785 contra
 * NF 180789, lançamentos legítimos e distintos. Usar só o par descartava 9 das
 * 33 linhas como duplicadas e perdia R$ 12.861,41 em silêncio.
 *
 * Somando conta, valor, data e descrição, as 33 linhas do arquivo real geram
 * 33 chaves distintas. O hash mantém a entrada do índice em 64 caracteres —
 * as descrições passam de 200 e um btree tem limite de 2704 bytes.
 *
 * Devolve null quando o razão não trouxe identificação alguma; nesse caso o
 * lançamento nunca é tratado como duplicado.
 */
function importKey(entry: ParsedEntry): string | null {
  if (!entry.voucher && !entry.journal) return null;
  const parts = [
    entry.voucher ?? '',
    entry.journal ?? '',
    entry.accountCode,
    entry.amount.toFixed(2),
    entry.entryDate,
    entry.description ?? '',
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

export function resolveImport(
  entries: ParsedEntry[],
  context: ResolutionContext,
): ImportPlan {
  const plans = new Map<string, ProjectPlan>();
  const seenKeys = new Map<string, Set<string>>();
  const unknown = new Map<string, UnknownCenter>();

  for (const entry of entries) {
    const project = context.projectsByCode[entry.costCenterCode];

    if (!project) {
      const current = unknown.get(entry.costCenterCode) ?? {
        code: entry.costCenterCode,
        name: entry.costCenterName,
        count: 0,
        total: 0,
      };
      current.count += 1;
      current.total = round2(current.total + entry.amount);
      unknown.set(entry.costCenterCode, current);
      continue;
    }

    let plan = plans.get(project.id);
    if (!plan) {
      plan = {
        projectId: project.id,
        projectName: project.name,
        centerCode: entry.costCenterCode,
        newEntries: [],
        unmappedAccounts: [],
        existingBudgetLines: context.budgetLinesByProject[project.id] ?? [],
        duplicateCount: 0,
        unmappedCount: 0,
        expenseTotal: 0,
        contributionTotal: 0,
      };
      plans.set(project.id, plan);
      seenKeys.set(
        project.id,
        new Set(context.existingKeysByProject[project.id] ?? []),
      );
    }

    const key = importKey(entry);
    const seen = seenKeys.get(project.id)!;
    if (key !== null && seen.has(key)) {
      plan.duplicateCount += 1;
      continue;
    }
    if (key !== null) seen.add(key);

    // Aporte é entrada de recurso, não gasto: não pertence a rubrica nenhuma.
    // Criar uma rubrica para a conta de receita poluiria a tela de orçamento e
    // o gráfico com uma linha que nunca terá valor orçado.
    const isAporte = entry.kind === 'aporte';

    // Resolução em duas etapas: primeiro o mapeamento salvo (migração 0012),
    // que é o caminho normal depois que o projeto já resolveu essa conta uma
    // vez; o casamento direto por `budget_lines.code` é só compatibilidade
    // com projetos que já dependiam dele antes de o mapeamento existir.
    const mapping = isAporte
      ? undefined
      : (context.mappingsByProject[project.id] ?? []).find(
          (m) => m.accountCode === entry.accountCode,
        );

    const existingLine = isAporte
      ? undefined
      : mapping
        ? { id: mapping.budgetLineId }
        : (context.budgetLinesByProject[project.id] ?? []).find(
            (l) => l.code === entry.accountCode,
          );

    if (!isAporte && !existingLine) {
      plan.unmappedCount += 1;
      if (!plan.unmappedAccounts.some((l) => l.code === entry.accountCode)) {
        plan.unmappedAccounts.push({ code: entry.accountCode, name: entry.accountName });
      }
    }

    if (isAporte) {
      // Sinal invertido: o razão lança o aporte como crédito negativo.
      plan.contributionTotal = round2(plan.contributionTotal + Math.abs(entry.amount));
    } else {
      plan.expenseTotal = round2(plan.expenseTotal + entry.amount);
    }

    plan.newEntries.push({
      ...entry,
      budgetLineCode: entry.accountCode,
      budgetLineId: existingLine?.id ?? null,
      importKey: key,
    });
  }

  return {
    projects: [...plans.values()],
    unknownCenters: [...unknown.values()],
  };
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `cd ~/projetos/farol-projetos && npm test -- import-resolution`
Expected: PASS — todos os testes do arquivo, incluindo os 3 novos.

- [ ] **Step 6: Commit**

```bash
cd ~/projetos/farol-projetos
git add lib/domain/import-resolution.ts lib/domain/import-resolution.test.ts
git commit -m "Resolve razão entries against saved account-to-rubrica mappings"
```

---

### Task 3: Rota de preview do import passa a buscar o mapeamento

**Files:**
- Modify: `app/api/import/route.ts`

**Interfaces:**
- Consumes: `ResolutionContext` (Task 2) — agora exige `mappingsByProject` e `budgetLinesByProject[...]` com `name`.
- Produces: resposta JSON de `POST /api/import` inalterada na forma (`{ filename, discardedRows, plan }`), mas `plan.projects[*]` agora carrega `unmappedAccounts` e `existingBudgetLines` (Task 2).

- [ ] **Step 1: Atualizar a busca de `budget_lines` e adicionar a busca de mapeamentos**

Substitua o arquivo inteiro por:

```ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { readWorkbookRows, parseLedgerRows } from '@/lib/domain/ledger-import';
import { resolveImport, type ResolutionContext } from '@/lib/domain/import-resolution';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Envie um arquivo .xlsx.' }, { status: 400 });
  }

  let parsed;
  try {
    const rows = await readWorkbookRows(await file.arrayBuffer());
    parsed = parseLedgerRows(rows);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Não foi possível ler a planilha.' },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const codes = parsed.centers.map((c) => c.code);

  const { data: projects } = await supabase
    .from('projects')
    .select('id, code, name')
    .in('code', codes);

  const projectIds = (projects ?? []).map((p) => p.id);

  const [{ data: lines }, { data: existing }, { data: mappings }] = await Promise.all([
    projectIds.length
      ? supabase
          .from('budget_lines')
          .select('id, code, name, project_id')
          .in('project_id', projectIds)
      : Promise.resolve({
          data: [] as { id: string; code: string | null; name: string; project_id: string }[],
        }),
    projectIds.length
      ? supabase
          .from('ledger_entries')
          .select('project_id, import_key')
          .in('project_id', projectIds)
          .eq('source', 'import')
      : Promise.resolve({ data: [] as { project_id: string; import_key: string | null }[] }),
    projectIds.length
      ? supabase
          .from('budget_line_account_mappings')
          .select('project_id, account_code, budget_line_id')
          .in('project_id', projectIds)
      : Promise.resolve({
          data: [] as { project_id: string; account_code: string; budget_line_id: string }[],
        }),
  ]);

  const context: ResolutionContext = {
    projectsByCode: Object.fromEntries(
      (projects ?? []).map((p) => [p.code, { id: p.id, name: p.name }]),
    ),
    budgetLinesByProject: {},
    existingKeysByProject: {},
    mappingsByProject: {},
  };

  for (const l of lines ?? []) {
    (context.budgetLinesByProject[l.project_id] ??= []).push({
      id: l.id,
      code: l.code,
      name: l.name,
    });
  }
  for (const e of existing ?? []) {
    if (e.import_key) {
      (context.existingKeysByProject[e.project_id] ??= []).push(e.import_key);
    }
  }
  for (const m of mappings ?? []) {
    (context.mappingsByProject[m.project_id] ??= []).push({
      accountCode: m.account_code,
      budgetLineId: m.budget_line_id,
    });
  }

  return NextResponse.json({
    filename: file.name,
    discardedRows: parsed.discardedRows,
    plan: resolveImport(parsed.entries, context),
  });
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd ~/projetos/farol-projetos && npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
cd ~/projetos/farol-projetos
git add app/api/import/route.ts
git commit -m "Fetch account-to-rubrica mappings when previewing an import"
```

---

### Task 4: Rota de commit aceita resoluções e grava o mapeamento

**Files:**
- Modify: `app/api/import/commit/route.ts`

**Interfaces:**
- Consumes: `ProjectPlan` (Task 2, com `unmappedAccounts`/`existingBudgetLines`).
- Produces: `POST /api/import/commit` passa a aceitar `resolutions: Resolution[]` no corpo; grava `budget_line_account_mappings`; cria rubricas de resoluções `'create'` **sem** `code`.

- [ ] **Step 1: Substituir o arquivo inteiro**

```ts
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ProjectPlan } from '@/lib/domain/import-resolution';
import type { LedgerEntryInsert } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BATCH_SIZE = 500;

// Validação local só do campo novo (`resolutions`) — as rotas de import não
// têm Zod hoje (destoa do resto do app, que valida tudo com Server Action +
// Zod), e não é o momento de reescrever a validação manual já existente ao
// redor deste payload. Ver docs/superpowers/specs/2026-07-30-mapeamento-conta-rubrica-design.md.
const resolutionSchema = z.discriminatedUnion('action', [
  z.object({
    accountCode: z.string().trim().min(1),
    action: z.literal('existing'),
    budgetLineId: z.string().uuid(),
  }),
  z.object({
    accountCode: z.string().trim().min(1),
    action: z.literal('create'),
    name: z.string().trim().min(1),
  }),
]);
type Resolution = z.infer<typeof resolutionSchema>;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function POST(request: Request) {
  let body: { filename?: string; plan?: ProjectPlan; resolutions?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
  }

  const { filename, plan, resolutions: rawResolutions } = body;
  if (!filename || !plan || !plan.projectId) {
    return NextResponse.json({ error: 'Plano de importação inválido.' }, { status: 400 });
  }

  const resolutionsResult = z.array(resolutionSchema).safeParse(rawResolutions ?? []);
  if (!resolutionsResult.success) {
    return NextResponse.json({ error: 'Resoluções de conta inválidas.' }, { status: 400 });
  }
  const resolutions: Resolution[] = resolutionsResult.data;

  const supabase = createAdminClient();

  // 1. Reaproveita mapeamento já gravado numa tentativa anterior (retry): sem
  // isso, repetir o commit com as mesmas resoluções criaria uma segunda
  // rubrica para cada conta resolvida como "criar nova".
  const resolutionCodes = resolutions.map((r) => r.accountCode);
  const { data: alreadyMapped } =
    resolutionCodes.length > 0
      ? await supabase
          .from('budget_line_account_mappings')
          .select('account_code, budget_line_id')
          .eq('project_id', plan.projectId)
          .in('account_code', resolutionCodes)
      : { data: [] as { account_code: string; budget_line_id: string }[] };

  const accountCodeToBudgetLineId = new Map<string, string>(
    (alreadyMapped ?? []).map((m) => [m.account_code, m.budget_line_id]),
  );

  for (const r of resolutions) {
    if (r.action === 'existing' && !accountCodeToBudgetLineId.has(r.accountCode)) {
      accountCodeToBudgetLineId.set(r.accountCode, r.budgetLineId);
    }
  }

  // 2. Cria as rubricas para as resoluções "criar nova" que ainda não têm
  // mapeamento (primeira tentativa). Sem código: o código da conta passa a
  // viver só no mapeamento, não em `budget_lines.code`.
  for (const r of resolutions) {
    if (r.action !== 'create' || accountCodeToBudgetLineId.has(r.accountCode)) continue;

    const { data: created, error: createError } = await supabase
      .from('budget_lines')
      .insert({
        project_id: plan.projectId,
        parent_id: null,
        code: null,
        name: r.name,
        budgeted_amount: null,
        sort_order: 0,
      })
      .select('id')
      .single();

    if (createError || !created) {
      return NextResponse.json(
        { error: createError?.message ?? 'Não foi possível criar a rubrica.' },
        { status: 500 },
      );
    }
    accountCodeToBudgetLineId.set(r.accountCode, created.id);
  }

  // 3. Grava o mapeamento conta -> rubrica para as duas resoluções — é o que
  // faz o próximo import da mesma conta resolver sozinho, sem perguntar de
  // novo. Upsert: idempotente num retry.
  if (resolutions.length > 0) {
    const { error: mappingError } = await supabase.from('budget_line_account_mappings').upsert(
      resolutions.map((r) => ({
        project_id: plan.projectId,
        account_code: r.accountCode,
        account_name:
          plan.unmappedAccounts.find((u) => u.code === r.accountCode)?.name ?? null,
        budget_line_id: accountCodeToBudgetLineId.get(r.accountCode)!,
      })),
      { onConflict: 'project_id,account_code' },
    );

    if (mappingError) {
      return NextResponse.json({ error: mappingError.message }, { status: 500 });
    }
  }

  // 4. Cria o batch com os contadores conhecidos pelo plano.
  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .insert({
      project_id: plan.projectId,
      filename,
      rows_read: plan.newEntries.length + plan.duplicateCount,
      rows_inserted: 0,
      rows_duplicate: plan.duplicateCount,
      rows_unmapped: plan.unmappedCount,
    })
    .select('id')
    .single();

  if (batchError || !batch) {
    return NextResponse.json(
      { error: batchError?.message ?? 'Não foi possível criar o lote de importação.' },
      { status: 500 },
    );
  }
  const batchId: string = batch.id;

  // 5. Insere os lançamentos em lotes de 500.
  //
  // O índice de idempotência (project_id, import_key) é parcial
  // (`where source = 'import'`) — o Postgres só usa um índice parcial como
  // alvo de ON CONFLICT quando o predicado é repetido na cláusula, e o
  // upsert do PostgREST/supabase-js não permite declarar esse predicado.
  // Verificado ao vivo: `.upsert(..., { onConflict: 'project_id,import_key' })`
  // falha sempre com 42P10 ("no unique or exclusion constraint matching the
  // ON CONFLICT specification"), mesmo sem conflito nenhum nos dados — não é
  // uma alternativa viável aqui. Em vez disso, inserimos com INSERT simples
  // (o plano já chega deduplicado pelo `resolveImport`, que consultou as
  // chaves existentes) e, se um lote inteiro for rejeitado por 23505 — o que
  // só aconteceria numa corrida entre duas importações do mesmo arquivo — ele
  // é refeito linha a linha para salvar as que não colidem.
  const rows: LedgerEntryInsert[] = plan.newEntries.map((entry) => ({
    project_id: plan.projectId,
    budget_line_id: entry.budgetLineId ?? accountCodeToBudgetLineId.get(entry.accountCode) ?? null,
    entry_date: entry.entryDate,
    amount: entry.amount.toFixed(2),
    kind: entry.kind,
    description: entry.description,
    account_code: entry.accountCode,
    account_name: entry.accountName,
    cost_center_code: entry.costCenterCode,
    voucher: entry.voucher,
    journal: entry.journal,
    document: entry.document,
    reference: entry.reference,
    vendor_doc: entry.vendorDoc,
    vendor_name: entry.vendorName,
    payment_date: entry.paymentDate,
    document_date: entry.documentDate,
    urls: entry.urls,
    source: 'import',
    notes: null,
    import_key: entry.importKey,
    import_batch_id: batchId,
    raw: entry.raw,
  }));

  let inserted = 0;
  try {
    for (const batchRows of chunk(rows, BATCH_SIZE)) {
      const { data, error } = await supabase.from('ledger_entries').insert(batchRows).select('id');

      if (!error) {
        inserted += data?.length ?? 0;
        continue;
      }

      if (error.code !== '23505') throw new Error(error.message);

      // Colisão no lote: refaz linha a linha para salvar o que não conflita.
      for (const row of batchRows) {
        const single = await supabase.from('ledger_entries').insert(row).select('id');
        if (!single.error) {
          inserted += single.data?.length ?? 0;
        } else if (single.error.code !== '23505') {
          throw new Error(single.error.message);
        }
      }
    }
  } catch (e) {
    // Os lançamentos já gravados permanecem — o import é idempotente e uma
    // nova tentativa (com um preview atualizado) só completa o que falta.
    await supabase.from('import_batches').delete().eq('id', batchId);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Falha ao gravar os lançamentos.' },
      { status: 500 },
    );
  }

  // 6. Atualiza o batch com o número realmente gravado.
  const { error: updateError } = await supabase
    .from('import_batches')
    .update({ rows_inserted: inserted })
    .eq('id', batchId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  revalidatePath('/');
  revalidatePath(`/projetos/${plan.projectId}`);
  revalidatePath(`/projetos/${plan.projectId}/financeiro`);
  revalidatePath(`/projetos/${plan.projectId}/financeiro/lancamentos`);
  revalidatePath(`/projetos/${plan.projectId}/financeiro/rubricas`);
  revalidatePath(`/projetos/${plan.projectId}/financeiro/importar`);
  revalidatePath(`/projetos/${plan.projectId}/financeiro/mapeamento`);

  return NextResponse.json({
    inserted,
    duplicates: plan.duplicateCount,
    unmapped: plan.unmappedCount,
    batchId,
  });
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd ~/projetos/farol-projetos && npx tsc --noEmit`
Expected: sem erros novos. (`_view.tsx` da tela de import ainda não manda `resolutions` — isso é opcional no body pela lógica acima, `rawResolutions ?? []`, então a rota funciona mesmo antes da Task 5.)

- [ ] **Step 3: Commit**

```bash
cd ~/projetos/farol-projetos
git add app/api/import/commit/route.ts
git commit -m "Accept account resolutions on import commit and persist mappings"
```

---

### Task 5: Tela de import vira decisão ativa por conta não mapeada

**Files:**
- Modify: `app/(app)/projetos/[id]/financeiro/importar/_view.tsx`

**Interfaces:**
- Consumes: `ProjectPlan.unmappedAccounts` e `ProjectPlan.existingBudgetLines` (Task 2); `POST /api/import/commit` aceitando `resolutions` (Task 4).
- Produces: nenhuma interface nova para outros arquivos — é a ponta final da cadeia.

- [ ] **Step 1: Substituir o arquivo inteiro**

```tsx
'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UploadIcon, FileSpreadsheetIcon, AlertTriangleIcon } from 'lucide-react';

import type { ProjectRow, ImportBatchRow } from '@/lib/supabase/types';
import type { ImportPlan, ProjectPlan, UnknownCenter } from '@/lib/domain/import-resolution';
import { formatBRL } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { BackLink } from '@/components/layout/back-link';
import { DimensionTabs } from '@/components/layout/dimension-tabs';

type PreviewResult = {
  filename: string;
  discardedRows: number;
  plan: ImportPlan;
};

/** Escolha do usuário para uma conta sem rubrica correspondente. */
type ResolutionChoice =
  | { action: 'existing'; budgetLineId: string }
  | { action: 'create' };

/** projectId -> accountCode -> escolha. */
type ResolutionState = Record<string, Record<string, ResolutionChoice>>;

const CREATE_NEW_VALUE = '__create_new__';

function formatDateTimeBR(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function isProjectResolved(plan: ProjectPlan, resolutions: Record<string, ResolutionChoice>): boolean {
  return plan.unmappedAccounts.every((a) => resolutions[a.code] !== undefined);
}

export function ImportarView({
  project,
  batches,
}: {
  project: ProjectRow;
  batches: ImportBatchRow[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [resolutions, setResolutions] = useState<ResolutionState>({});

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      toast.error('Envie um arquivo .xlsx.');
      return;
    }

    setLoading(true);
    setResult(null);
    setResolutions({});
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/import', { method: 'POST', body: formData });
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error ?? 'Não foi possível ler a planilha.');
        return;
      }
      setResult(json as PreviewResult);
    } catch {
      toast.error('Falha ao enviar o arquivo.');
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Limpa o valor para que selecionar o mesmo arquivo de novo (reimportar
    // para testar idempotência) dispare o evento de novo.
    e.target.value = '';
    if (file) void handleFile(file);
  }

  function handleCancel() {
    setResult(null);
    setResolutions({});
  }

  function handleResolve(projectId: string, accountCode: string, choice: ResolutionChoice) {
    setResolutions((prev) => ({
      ...prev,
      [projectId]: { ...(prev[projectId] ?? {}), [accountCode]: choice },
    }));
  }

  const allResolved = useMemo(() => {
    if (!result) return false;
    return result.plan.projects.every((p) => isProjectResolved(p, resolutions[p.projectId] ?? {}));
  }, [result, resolutions]);

  async function handleConfirm() {
    if (!result) return;
    setCommitting(true);

    let totalInserted = 0;
    let totalDuplicates = 0;
    const errors: string[] = [];

    for (const projectPlan of result.plan.projects) {
      const projectResolutions = resolutions[projectPlan.projectId] ?? {};
      const resolutionsPayload = projectPlan.unmappedAccounts.map((account) => {
        const choice = projectResolutions[account.code];
        return choice?.action === 'existing'
          ? { accountCode: account.code, action: 'existing' as const, budgetLineId: choice.budgetLineId }
          : { accountCode: account.code, action: 'create' as const, name: account.name };
      });

      try {
        const res = await fetch('/api/import/commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: result.filename,
            plan: projectPlan,
            resolutions: resolutionsPayload,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          errors.push(`${projectPlan.projectName}: ${json.error ?? 'erro desconhecido'}`);
          continue;
        }
        totalInserted += json.inserted;
        totalDuplicates += json.duplicates;
      } catch {
        errors.push(`${projectPlan.projectName}: falha ao confirmar o import.`);
      }
    }

    setCommitting(false);

    if (errors.length > 0) {
      toast.error(`Alguns projetos falharam: ${errors.join(' ')}`);
    }
    if (totalInserted > 0 || totalDuplicates > 0) {
      toast.success(
        `${totalInserted} lançamento(s) novo(s) importado(s), ${totalDuplicates} duplicado(s) ignorado(s).`,
      );
    }

    setResult(null);
    setResolutions({});
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href={`/projetos/${project.id}/financeiro`} label="Financeiro" />
        <DimensionTabs projectId={project.id} active="financeiro" />
        <div>
          <h1 className="font-display text-2xl">Importar razão</h1>
          <p className="text-sm text-muted-foreground">
            {project.code} — {project.name}
          </p>
        </div>
      </div>

      {!result && (
        <Card>
          <CardContent>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-16 text-center transition-colors ${
                dragOver ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <UploadIcon className="size-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  Arraste o arquivo .xlsx do razão aqui, ou clique para escolher
                </p>
                <p className="text-xs text-muted-foreground">
                  Exportação do Genus — planilha com as colunas Centro, Conta, Valor etc.
                </p>
              </div>
              {loading && <p className="text-xs text-muted-foreground">Lendo planilha…</p>}
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={onInputChange}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex items-center gap-2 py-3 text-sm">
              <FileSpreadsheetIcon className="size-4 text-muted-foreground" />
              <span className="font-medium">{result.filename}</span>
              <span className="text-muted-foreground">
                — {result.discardedRows} linha(s) descartada(s) do rodapé/vazias
              </span>
            </CardContent>
          </Card>

          {result.plan.projects.map((projectPlan) => (
            <ProjectPlanCard
              key={projectPlan.projectId}
              plan={projectPlan}
              resolutions={resolutions[projectPlan.projectId] ?? {}}
              onResolve={(accountCode, choice) =>
                handleResolve(projectPlan.projectId, accountCode, choice)
              }
            />
          ))}

          {result.plan.unknownCenters.map((center) => (
            <UnknownCenterCard key={center.code} center={center} />
          ))}

          {result.plan.projects.length === 0 && result.plan.unknownCenters.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhum lançamento reconhecido nesta planilha.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCancel} disabled={committing}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={committing || result.plan.projects.length === 0 || !allResolved}
            >
              {committing ? 'Confirmando…' : 'Confirmar import'}
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="eyebrow">Histórico de importações</p>
        {batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma importação registrada ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Arquivo</TableHead>
                <TableHead>Lidas</TableHead>
                <TableHead>Inseridas</TableHead>
                <TableHead>Duplicadas</TableHead>
                <TableHead>Sem rubrica</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>{formatDateTimeBR(b.imported_at)}</TableCell>
                  <TableCell className="max-w-[240px] truncate" title={b.filename}>
                    {b.filename}
                  </TableCell>
                  <TableCell>{b.rows_read}</TableCell>
                  <TableCell>{b.rows_inserted}</TableCell>
                  <TableCell>{b.rows_duplicate}</TableCell>
                  <TableCell>{b.rows_unmapped}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function ProjectPlanCard({
  plan,
  resolutions,
  onResolve,
}: {
  plan: ProjectPlan;
  resolutions: Record<string, ResolutionChoice>;
  onResolve: (accountCode: string, choice: ResolutionChoice) => void;
}) {
  const lineItems = useMemo(
    () =>
      Object.fromEntries([
        ...plan.existingBudgetLines.map((l): [string, string] => [
          l.id,
          l.code ? `${l.code} — ${l.name}` : l.name,
        ]),
        [CREATE_NEW_VALUE, '+ Criar rubrica nova'],
      ]),
    [plan.existingBudgetLines],
  );

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium">{plan.projectName}</p>
            <p className="text-xs text-muted-foreground">Centro {plan.centerCode}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline">
              {plan.newEntries.length} novo(s) — {formatBRL(plan.expenseTotal)}
            </Badge>
            {plan.duplicateCount > 0 && (
              <Badge variant="secondary">
                {plan.duplicateCount} duplicado(s) (já importados)
              </Badge>
            )}
            {plan.contributionTotal !== 0 && (
              <Badge variant="outline">Baixas: {formatBRL(plan.contributionTotal)}</Badge>
            )}
          </div>
        </div>

        {plan.unmappedAccounts.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangleIcon className="size-3.5" />
              Contas sem rubrica — decida para onde cada uma vai
            </p>
            <div className="flex flex-col gap-2">
              {plan.unmappedAccounts.map((account) => {
                const choice = resolutions[account.code];
                const selectValue =
                  choice?.action === 'existing'
                    ? choice.budgetLineId
                    : choice?.action === 'create'
                      ? CREATE_NEW_VALUE
                      : undefined;

                return (
                  <div key={account.code} className="flex flex-wrap items-center gap-2">
                    <div className="flex-1 text-xs">
                      <span className="font-mono text-muted-foreground">{account.code}</span>{' '}
                      <span>{account.name}</span>
                    </div>
                    <Select
                      items={lineItems}
                      value={selectValue}
                      onValueChange={(v) => {
                        if (!v) return;
                        onResolve(
                          account.code,
                          v === CREATE_NEW_VALUE
                            ? { action: 'create' }
                            : { action: 'existing', budgetLineId: v },
                        );
                      }}
                    >
                      <SelectTrigger className="w-64">
                        <SelectValue placeholder="Essa conta corresponde a qual rubrica?" />
                      </SelectTrigger>
                      <SelectContent>
                        {plan.existingBudgetLines.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.code ? `${l.code} — ${l.name}` : l.name}
                          </SelectItem>
                        ))}
                        <SelectItem value={CREATE_NEW_VALUE}>
                          + Criar rubrica nova ({account.name})
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UnknownCenterCard({ center }: { center: UnknownCenter }) {
  return (
    <Card className="bg-muted/50">
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Nenhum projeto cadastrado com o centro {center.code} — {center.count} lançamento(s)
          serão ignorados
        </p>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={
            <Link
              href={`/projetos/novo?code=${encodeURIComponent(center.code)}&name=${encodeURIComponent(center.name)}`}
            />
          }
        >
          Cadastrar projeto
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd ~/projetos/farol-projetos && npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Testar manualmente**

Run: `cd ~/projetos/farol-projetos && npm run dev`

No navegador, abra `/projetos/<id>/financeiro/importar` de um projeto com pelo menos uma rubrica cadastrada (ex.: um dos 4 projetos SESI-AL configurados em 2026-07-30) e importe um `.xlsx` de teste com pelo menos uma conta que não bate com nenhuma rubrica. Confirme:
- A caixa âmbar aparece com um seletor por conta, não mais como aviso passivo.
- "Confirmar import" fica desabilitado até escolher uma opção para cada conta.
- Escolher "+ Criar rubrica nova" e confirmar cria a rubrica (visível em `/financeiro/rubricas`, sem código) e o lançamento aparece classificado nela.
- Reimportar o mesmo arquivo (ou um novo arquivo com a mesma conta) não pergunta de novo — a conta já resolve sozinha.

- [ ] **Step 4: Commit**

```bash
cd ~/projetos/farol-projetos
git add "app/(app)/projetos/[id]/financeiro/importar/_view.tsx"
git commit -m "Turn unmapped account handling into an active decision in the import UI"
```

---

### Task 6: Zod schema do mapeamento manual

**Files:**
- Create: `lib/actions/mapping-schema.ts`
- Create: `lib/actions/mapping-schema.test.ts`

**Interfaces:**
- Produces: `mappingFormSchema` (Zod), `MappingFormValues` (tipo inferido) — consumidos pela Task 7 (Server Actions) e Task 8 (formulário da página).

- [ ] **Step 1: Escrever o teste (falhando)**

Crie `lib/actions/mapping-schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mappingFormSchema } from './mapping-schema';

function parse(input: Record<string, unknown>) {
  return mappingFormSchema.safeParse(input);
}

describe('mappingFormSchema', () => {
  it('aceita conta, nome e rubrica válidos', () => {
    const r = parse({
      accountCode: '31010401001',
      accountName: 'Passagens Nacionais',
      budgetLineId: '11111111-1111-4111-8111-111111111111',
    });
    expect(r.success).toBe(true);
  });

  it('rejeita código de conta vazio', () => {
    const r = parse({
      accountCode: '   ',
      accountName: null,
      budgetLineId: '11111111-1111-4111-8111-111111111111',
    });
    expect(r.success).toBe(false);
  });

  it('aceita nome de conta nulo', () => {
    const r = parse({
      accountCode: '31010401001',
      accountName: null,
      budgetLineId: '11111111-1111-4111-8111-111111111111',
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.accountName).toBeNull();
  });

  it('rejeita budgetLineId que não é uuid', () => {
    const r = parse({
      accountCode: '31010401001',
      accountName: null,
      budgetLineId: 'nao-e-uuid',
    });
    expect(r.success).toBe(false);
  });

  it('remove espaço nas pontas do código da conta', () => {
    const r = parse({
      accountCode: '  31010401001  ',
      accountName: null,
      budgetLineId: '11111111-1111-4111-8111-111111111111',
    });
    expect(r.success && r.data.accountCode).toBe('31010401001');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd ~/projetos/farol-projetos && npm test -- mapping-schema`
Expected: FAIL — `Cannot find module './mapping-schema'`.

- [ ] **Step 3: Criar o schema**

Crie `lib/actions/mapping-schema.ts`:

```ts
import { z } from 'zod';

// Sem diretiva 'use server' — mesmo motivo de `budget-line-schema.ts`: um
// arquivo com 'use server' no topo só pode exportar funções assíncronas, e
// `mappingFormSchema` é um valor (objeto Zod). Client Components (o
// formulário da página de mapeamento) importam o schema daqui; as Server
// Actions ficam em `./mapping-mutations`.

export const mappingFormSchema = z.object({
  accountCode: z.string().trim().min(1, 'Informe o código da conta'),
  accountName: z.string().trim().nullable(),
  budgetLineId: z.string().uuid('Selecione uma rubrica'),
});

export type MappingFormValues = z.infer<typeof mappingFormSchema>;
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/projetos/farol-projetos && npm test -- mapping-schema`
Expected: PASS — 5 testes.

- [ ] **Step 5: Commit**

```bash
cd ~/projetos/farol-projetos
git add lib/actions/mapping-schema.ts lib/actions/mapping-schema.test.ts
git commit -m "Add Zod schema for manual account-to-rubrica mapping form"
```

---

### Task 7: Server Actions do mapeamento manual

**Files:**
- Create: `lib/actions/mapping-mutations.ts`
- Create: `lib/actions/mapping.ts`

**Interfaces:**
- Consumes: `mappingFormSchema`, `MappingFormValues` (Task 6); `ActionResult` de `lib/actions/project-schema.ts` (já existe).
- Produces: `createMapping(projectId, input): Promise<ActionResult<{ id: string }>>`, `deleteMapping(id): Promise<ActionResult>` — consumidos pela Task 8.

- [ ] **Step 1: Criar as Server Actions**

Crie `lib/actions/mapping-mutations.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ActionResult } from './project-schema';
import { mappingFormSchema, type MappingFormValues } from './mapping-schema';

export async function createMapping(
  projectId: string,
  input: MappingFormValues,
): Promise<ActionResult<{ id: string }>> {
  const parsed = mappingFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('budget_line_account_mappings')
    .insert({
      project_id: projectId,
      account_code: parsed.data.accountCode,
      account_name: parsed.data.accountName,
      budget_line_id: parsed.data.budgetLineId,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'Essa conta já está mapeada para outra rubrica neste projeto.' };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/projetos/${projectId}/financeiro/mapeamento`);
  return { ok: true, data: { id: data.id } };
}

export async function deleteMapping(id: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { data: mapping } = await supabase
    .from('budget_line_account_mappings')
    .select('project_id')
    .eq('id', id)
    .maybeSingle();

  if (!mapping) return { ok: false, error: 'Mapeamento não encontrado.' };

  const { error } = await supabase.from('budget_line_account_mappings').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/projetos/${mapping.project_id}/financeiro/mapeamento`);
  return { ok: true, data: undefined };
}
```

- [ ] **Step 2: Criar a fachada pública**

Crie `lib/actions/mapping.ts`:

```ts
// Fachada pública consumida pela tela (schema, tipos e as duas Server
// Actions de mapeamento). Mesmo padrão de `budget-lines.ts`: o schema vive em
// `./mapping-schema` (sem 'use server', porque exporta um valor Zod, não só
// funções), a implementação em `./mapping-mutations` ('use server'), e este
// módulo só reexporta os dois.
export type { MappingFormValues } from './mapping-schema';
export { mappingFormSchema } from './mapping-schema';
export { createMapping, deleteMapping } from './mapping-mutations';
```

- [ ] **Step 3: Verificar que compila**

Run: `cd ~/projetos/farol-projetos && npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
cd ~/projetos/farol-projetos
git add lib/actions/mapping-mutations.ts lib/actions/mapping.ts
git commit -m "Add Server Actions for manual account-to-rubrica mapping"
```

---

### Task 8: Página `/financeiro/mapeamento`

**Files:**
- Create: `app/(app)/projetos/[id]/financeiro/mapeamento/page.tsx`
- Create: `app/(app)/projetos/[id]/financeiro/mapeamento/_view.tsx`

**Interfaces:**
- Consumes: `createMapping`, `deleteMapping`, `mappingFormSchema`, `MappingFormValues` de `@/lib/actions/mapping` (Task 7); `ProjectRow` de `@/lib/supabase/types`.
- Produces: rota `/projetos/[id]/financeiro/mapeamento` navegável a partir do botão adicionado na Task 9.

- [ ] **Step 1: Criar o Server Component da página**

Crie `app/(app)/projetos/[id]/financeiro/mapeamento/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { MapeamentoView } from './_view';

export const dynamic = 'force-dynamic';

export default async function MapeamentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: project }, { data: budgetLines }, { data: mappings }] = await Promise.all([
    supabase.from('projects').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('budget_lines')
      .select('id, code, name')
      .eq('project_id', id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('budget_line_account_mappings')
      .select('id, account_code, account_name, budget_line_id')
      .eq('project_id', id)
      .order('account_code', { ascending: true }),
  ]);

  if (!project) notFound();

  return (
    <MapeamentoView
      project={project}
      budgetLines={budgetLines ?? []}
      mappings={mappings ?? []}
    />
  );
}
```

- [ ] **Step 2: Criar o Client Component da página**

Crie `app/(app)/projetos/[id]/financeiro/mapeamento/_view.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { z } from 'zod';
import { PlusIcon, XIcon } from 'lucide-react';

import type { ProjectRow } from '@/lib/supabase/types';
import {
  createMapping,
  deleteMapping,
  mappingFormSchema,
  type MappingFormValues,
} from '@/lib/actions/mapping';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BackLink } from '@/components/layout/back-link';
import { DimensionTabs } from '@/components/layout/dimension-tabs';

type BudgetLineOption = { id: string; code: string | null; name: string };
type MappingRow = {
  id: string;
  account_code: string;
  account_name: string | null;
  budget_line_id: string;
};

export function MapeamentoView({
  project,
  budgetLines,
  mappings,
}: {
  project: ProjectRow;
  budgetLines: BudgetLineOption[];
  mappings: MappingRow[];
}) {
  const [newOpen, setNewOpen] = useState(false);

  const mappingsByLine = useMemo(() => {
    const map = new Map<string, MappingRow[]>();
    for (const m of mappings) {
      const list = map.get(m.budget_line_id) ?? [];
      list.push(m);
      map.set(m.budget_line_id, list);
    }
    return map;
  }, [mappings]);

  const lineItems = useMemo(
    () =>
      Object.fromEntries(
        budgetLines.map((l): [string, string] => [
          l.id,
          l.code ? `${l.code} — ${l.name}` : l.name,
        ]),
      ),
    [budgetLines],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href={`/projetos/${project.id}/financeiro`} label="Financeiro" />
        <DimensionTabs projectId={project.id} active="financeiro" />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl">Mapeamento conta → rubrica</h1>
            <p className="text-sm text-muted-foreground">
              {project.code} — {project.name}
            </p>
          </div>
          <Button onClick={() => setNewOpen(true)} disabled={budgetLines.length === 0}>
            <PlusIcon className="size-4" />
            Novo mapeamento
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Ao importar o razão, uma conta sem mapeamento salvo pede uma decisão na hora. Cadastrar
          aqui de antemão evita a pergunta no dia do import.
        </p>
      </div>

      {budgetLines.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Cadastre ao menos uma rubrica antes de mapear contas do razão.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {budgetLines.map((line) => (
            <Card key={line.id}>
              <CardContent className="flex flex-col gap-3">
                <p className="font-medium">
                  {line.code ? `${line.code} — ` : ''}
                  {line.name}
                </p>
                {(mappingsByLine.get(line.id) ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma conta mapeada ainda.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {(mappingsByLine.get(line.id) ?? []).map((m) => (
                      <MappingItem key={m.id} mapping={m} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewMappingDialog
        projectId={project.id}
        budgetLines={budgetLines}
        lineItems={lineItems}
        open={newOpen}
        onOpenChange={setNewOpen}
      />
    </div>
  );
}

function MappingItem({ mapping }: { mapping: MappingRow }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    setPending(true);
    const result = await deleteMapping(mapping.id);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Mapeamento removido.');
    router.refresh();
  }

  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <span>
        <span className="font-mono text-xs text-muted-foreground">{mapping.account_code}</span>
        {mapping.account_name && (
          <span className="text-muted-foreground"> — {mapping.account_name}</span>
        )}
      </span>
      <Button type="button" variant="ghost" size="icon-xs" disabled={pending} onClick={handleDelete}>
        <XIcon className="size-3.5" />
        <span className="sr-only">Remover mapeamento</span>
      </Button>
    </li>
  );
}

function NewMappingDialog({
  projectId,
  budgetLines,
  lineItems,
  open,
  onOpenChange,
}: {
  projectId: string;
  budgetLines: BudgetLineOption[];
  lineItems: Record<string, string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof mappingFormSchema>, unknown, MappingFormValues>({
    resolver: zodResolver(mappingFormSchema),
    defaultValues: { accountCode: '', accountName: null, budgetLineId: budgetLines[0]?.id ?? '' },
  });

  async function submit(values: MappingFormValues) {
    const result = await createMapping(projectId, values);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Mapeamento criado.');
    reset({ accountCode: '', accountName: null, budgetLineId: budgetLines[0]?.id ?? '' });
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo mapeamento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mapping-account-code">Código da conta (razão)</Label>
            <Input
              id="mapping-account-code"
              placeholder="ex: 31010401001"
              {...register('accountCode')}
            />
            {errors.accountCode && (
              <p className="text-xs text-destructive">{errors.accountCode.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mapping-account-name">Nome da conta (opcional)</Label>
            <Controller
              control={control}
              name="accountName"
              render={({ field }) => (
                <Input
                  id="mapping-account-name"
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                />
              )}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mapping-budget-line">Rubrica de destino</Label>
            <Controller
              control={control}
              name="budgetLineId"
              render={({ field }) => (
                <Select
                  items={lineItems}
                  value={field.value}
                  onValueChange={(v) => field.onChange(v ?? '')}
                >
                  <SelectTrigger id="mapping-budget-line" className="w-full">
                    <SelectValue placeholder="Selecione uma rubrica" />
                  </SelectTrigger>
                  <SelectContent>
                    {budgetLines.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.code ? `${l.code} — ${l.name}` : l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.budgetLineId && (
              <p className="text-xs text-destructive">{errors.budgetLineId.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Criar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Verificar que compila**

Run: `cd ~/projetos/farol-projetos && npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
cd ~/projetos/farol-projetos
git add "app/(app)/projetos/[id]/financeiro/mapeamento"
git commit -m "Add manual account-to-rubrica mapping page"
```

---

### Task 9: Botão de navegação e verificação final

**Files:**
- Modify: `app/(app)/projetos/[id]/financeiro/_view.tsx`

**Interfaces:**
- Consumes: nenhuma nova.
- Produces: nenhuma — ponta final, só navegação.

- [ ] **Step 1: Adicionar o botão "Mapeamento"**

Em `app/(app)/projetos/[id]/financeiro/_view.tsx`, depois do botão "Importar" (linhas 93-99), adicione:

```tsx
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/projetos/${project.id}/financeiro/importar`} />}
            >
              Importar
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/projetos/${project.id}/financeiro/mapeamento`} />}
            >
              Mapeamento
            </Button>
```

(O trecho acima repete o botão "Importar" já existente só para mostrar onde o novo entra — na edição real, mantenha o "Importar" como está e insira só o bloco do "Mapeamento" logo depois dele.)

- [ ] **Step 2: Testar manualmente a navegação**

Com `npm run dev` rodando, abra `/projetos/<id>/financeiro` e confirme que o botão "Mapeamento" aparece ao lado de Rubricas/Lançamentos/Importar e leva para `/financeiro/mapeamento`.

- [ ] **Step 3: Rodar a suite inteira**

Run: `cd ~/projetos/farol-projetos && npm test`
Expected: PASS — todos os testes, incluindo os de `import-resolution.test.ts` e `mapping-schema.test.ts`.

- [ ] **Step 4: Build completo**

Run: `cd ~/projetos/farol-projetos && npm run build`
Expected: build sem erros de tipo ou lint.

- [ ] **Step 5: Commit**

```bash
cd ~/projetos/farol-projetos
git add "app/(app)/projetos/[id]/financeiro/_view.tsx"
git commit -m "Add navigation link to the account-to-rubrica mapping page"
```

---

## Self-Review

**Cobertura da spec:** schema (Task 1) ✓, `resolveImport` consultando mapeamento (Task 2) ✓, rota de preview buscando mapeamento (Task 3) ✓, rota de commit aceitando `resolutions` e gravando mapeamento pros dois tipos de resolução (Task 4) ✓, UI de import virando decisão ativa (Task 5) ✓, schema + Server Actions + página de mapeamento manual (Tasks 6-8) ✓, botão de navegação (Task 9) ✓. Os itens "fora de escopo" da spec (mapeamento global, reclassificação retroativa, migrar rotas de import para Server Action) não têm task — de propósito.

**Placeholders:** nenhum "TBD"/"implementar depois" — todo passo tem código completo.

**Consistência de tipos:** `ProjectPlan.unmappedAccounts` (Task 2) é o nome usado em todas as tasks seguintes (3, 4, 5) — nenhuma referência residual a `newBudgetLines`. `ResolutionChoice` (Task 5) e `Resolution`/`resolutionSchema` (Task 4) têm o mesmo formato de payload (`{ accountCode, action: 'existing', budgetLineId }` / `{ accountCode, action: 'create', name }`), verificado campo a campo. `MappingFormValues` (Task 6) é o mesmo tipo consumido em `mapping-mutations.ts` (Task 7) e no formulário da Task 8.

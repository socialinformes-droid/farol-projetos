# Farol de Projetos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir uma plataforma interna que cadastra projetos institucionais com orçamento por rubrica, importa o razão contábil em `.xlsx`, e alerta quando o remanejamento entre rubricas se aproxima do teto configurável.

**Architecture:** Fork podado do Financeme (`~/projetos/financeiro`). Next.js 16 App Router com `page.tsx` server buscando dados e `_view.tsx` client cuidando de interação. Toda a lógica de negócio vive em módulos puros sob `lib/domain/`, sem dependência de Supabase, testados com Vitest. Acesso ao banco exclusivamente server-side via service role key, através de Server Actions e Route Handlers — nunca do browser.

**Tech Stack:** Next.js 16.2.4, React 19.2, TypeScript, Tailwind 4, Base UI + shadcn, Recharts, React Hook Form + Zod, Sonner, Vitest, SheetJS (leitura de xlsx, vendorizado) + ExcelJS (escrita), Supabase (project_ref `pseksrhwsgfoyackzahb`), deploy Vercel.

## Global Constraints

- **Next.js 16.2.4.** O middleware chama-se `proxy.ts`, não `middleware.ts`. Antes de escrever qualquer código de framework, leia o guia pertinente em `node_modules/next/dist/docs/` — esta versão tem breaking changes em relação ao que você conhece.
- **Runtime do `proxy.ts` é Edge.** Nada de `node:crypto`, `Buffer` ou APIs de Node dentro dele nem em nada que ele importe. Use Web Crypto (`crypto.subtle`).
- **`SUPABASE_SERVICE_ROLE_KEY` jamais chega ao browser.** Nenhuma variável de acesso ao banco pode ter prefixo `NEXT_PUBLIC_`. Não existe cliente Supabase de browser neste projeto.
- **Idioma:** toda a UI, mensagens de erro e nomes de coluna visíveis em português do Brasil, com acentuação correta. Identificadores de código em inglês.
- **Moeda e data:** sempre pelos helpers de `lib/format.ts` (`formatBRL`, `formatDateBR`). Nunca `toLocaleString` solto.
- **Valores monetários** são `numeric(14,2)` no Postgres. O PostgREST os devolve como **number**, apesar de `lib/supabase/types.ts` declará-los `string` — verificado contra o banco real. Converta sempre com `Number()` na fronteira e **nunca chame método de string** (`.split`, `.replace`, `.toFixed` sobre o valor cru) nesses campos: typecheca e explode em runtime.
- **Um arquivo com `'use server'` no topo só pode exportar funções assíncronas.** Schemas Zod, tipos e constantes não podem morar nele. O padrão estabelecido na Task 7 e que todas as tasks de actions seguem:
  - `lib/actions/<dominio>-schema.ts` — sem diretiva, exporta o schema Zod, os tipos e `ActionResult`. Importável por Client Components.
  - `lib/actions/<dominio>-mutations.ts` — com `'use server'`, só as actions assíncronas.
  - `lib/actions/<dominio>.ts` — fachada sem diretiva, reexporta os dois. É o caminho de import que as outras tasks usam.
- **`Database` em `lib/supabase/types.ts` exige `Relationships: []` em cada tabela.** Sem isso o `@supabase/supabase-js` colapsa o retorno de `.from()` para `never` e todo acesso ao banco para de typechecar.
- **RLS habilitada e sem policy alguma** em todas as tabelas. O acesso legítimo é só por service role.
- **Nenhum dado real de fornecedor** (CNPJ, razão social) entra em fixture de teste. Use os valores fictícios especificados na Task 5.
- **Após todo `ALTER TABLE` ou `CREATE TABLE`,** execute `NOTIFY pgrst, 'reload schema';` — sem isso o PostgREST responde "column not found" em escritas.
- **Commits** em português, prefixo convencional (`feat:`, `fix:`, `test:`, `chore:`, `docs:`).

---

### Task 1: Fork podado e esqueleto do app

**Files:**
- Create: `~/projetos/farol-projetos/**` (cópia do Financeme, sem `.git`)
- Create: `.env.local`, `.env.example`
- Modify: `package.json`, `app/layout.tsx`, `next.config.ts`, `README.md`
- Delete: ver Step 2

**Interfaces:**
- Consumes: nada (primeira task)
- Produces: projeto que builda e roda; `components/ui/*`, `lib/format.ts`, `lib/utils.ts` disponíveis para todas as tasks seguintes

- [ ] **Step 1: Copiar a base**

O repositório já existe com o spec commitado. Copie por cima, preservando `.git`, `docs/`, `.mcp.json` e `.claude/`.

```bash
cd ~/projetos/farol-projetos
rsync -a --exclude='.git' --exclude='node_modules' --exclude='.next' \
      --exclude='.vercel' --exclude='docs' --exclude='tsconfig.tsbuildinfo' \
      ~/projetos/financeiro/ ./
```

- [ ] **Step 2: Podar o domínio financeiro pessoal**

```bash
cd ~/projetos/farol-projetos
rm -rf "app/(app)/cards" "app/(app)/installments" "app/(app)/shopping" \
       "app/(app)/forecast" "app/(app)/transactions" "app/(app)/dashboard" \
       "app/(app)/settings" "app/(auth)" "app/callback" \
       components/cards research
rm -f components/forms/card-form.tsx \
      components/forms/installment-group-form.tsx \
      components/forms/shopping-form.tsx \
      components/forms/transaction-form.tsx \
      components/forms/bulk-transactions-form.tsx \
      lib/domain/card-fatura-composition.ts \
      lib/domain/card-fatura-composition.test.ts \
      lib/domain/card-faturas.ts \
      lib/domain/billing.ts \
      lib/domain/installments.ts \
      lib/domain/categories.ts \
      lib/domain/categories-fetch.ts \
      lib/domain/years.ts \
      lib/seed.ts lib/seed-data.ts \
      lib/supabase/client.ts lib/supabase/middleware.ts \
      lib/supabase/server.ts lib/supabase/types.ts \
      components/layout/year-switcher.tsx \
      components/charts/income-vs-expense-chart.tsx \
      components/charts/category-pie-chart.tsx \
      components/charts/charts-section.tsx
rm -rf supabase/migrations supabase/.temp
mkdir -p supabase/migrations
```

`components/pivot-table.tsx` e `components/calculator-fab.tsx` **permanecem** — serão reaproveitados nas Tasks 7 e 8.

- [ ] **Step 3: Ajustar dependências**

```bash
cd ~/projetos/farol-projetos
npm pkg set name=farol-projetos
npm install exceljs
npm uninstall @supabase/ssr
npm install
```

`@supabase/ssr` existe para sincronizar sessão de auth via cookie. Sem login de usuário ele não tem função; usamos `@supabase/supabase-js` direto.

- [ ] **Step 4: Escrever `app/layout.tsx`**

Substitua o bloco `metadata` e remova nada mais (as fontes ficam):

```tsx
export const metadata: Metadata = {
  title: "Farol de Projetos",
  description: "Gestão orçamentária de projetos por rubrica",
  applicationName: "Farol de Projetos",
};
```

- [ ] **Step 5: Criar `app/(app)/layout.tsx`**

Substitui integralmente o do Financeme, que dependia de auth de usuário e de seed.

```tsx
import { Sidebar } from '@/components/layout/sidebar';
import { MobileHeader } from '@/components/layout/mobile-header';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <Sidebar />
      <MobileHeader />
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">{children}</div>
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Simplificar `sidebar.tsx` e `mobile-header.tsx`**

Ambos recebiam `availableYears` e `userEmail`. Remova essas props e o import de `YearSwitcher`. Substitua a lista de navegação por:

```tsx
const NAV = [
  { href: '/', label: 'Projetos', icon: FolderKanban },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
];
```

Importe `FolderKanban` e `Settings` de `lucide-react` e remova os ícones órfãos.

- [ ] **Step 7: Criar a home provisória**

`app/(app)/page.tsx` — será reescrita na Task 6. Delete `app/page.tsx`, que era a landing do Financeme.

```tsx
export const dynamic = 'force-dynamic';

export default function ProjectsPage() {
  return <h1 className="font-display text-2xl">Projetos</h1>;
}
```

- [ ] **Step 8: Criar `.env.example` e `.env.local`**

`.env.example` (commitado):

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
APP_PASSWORD=
SESSION_SECRET=
```

`.env.local` (nunca commitado — confirme que `.gitignore` cobre `.env*.local`) com os valores reais. Gere o segredo com `openssl rand -hex 32`.

- [ ] **Step 9: Neutralizar `proxy.ts`**

Ele importa `lib/supabase/middleware`, que foi deletado. Substitua por um passa-tudo temporário; a Task 4 escreve a versão real.

```ts
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

- [ ] **Step 10: Verificar que builda**

```bash
cd ~/projetos/farol-projetos && npm run build
```

Esperado: build conclui sem erro. Se houver import quebrado apontando para arquivo deletado, remova o import — não recrie o arquivo.

```bash
npm test
```

Esperado: `No test files found` — sucesso, já que a Task 1 não introduz teste.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: fork podado do Financeme como base do Farol de Projetos"
```

---

### Task 2: Schema no Supabase e tipos

**Files:**
- Create: `supabase/migrations/0001_initial_schema.sql`
- Create: `lib/supabase/types.ts`
- Create: `lib/supabase/admin.ts`

**Interfaces:**
- Consumes: Task 1 (projeto buildando)
- Produces:
  - `createAdminClient(): SupabaseClient<Database>` — usado por toda Server Action e Route Handler
  - Tipos `ProjectRow`, `BudgetLineRow`, `LedgerEntryRow`, `ImportBatchRow` e suas variantes `Insert`

- [ ] **Step 1: Escrever a migration**

`supabase/migrations/0001_initial_schema.sql`:

```sql
-- Farol de Projetos — schema inicial (2026-07-27)

create extension if not exists "pgcrypto";

create table projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  total_budget numeric(14,2) not null check (total_budget >= 0),
  start_date date,
  end_date date,
  status text not null default 'ativo'
    check (status in ('planejamento','ativo','encerrado')),
  transfer_limit_pct numeric(5,2) not null default 25
    check (transfer_limit_pct >= 0 and transfer_limit_pct <= 100),
  warning_threshold_pct numeric(5,2) not null default 80
    check (warning_threshold_pct >= 0 and warning_threshold_pct <= 100),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table budget_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  parent_id uuid references budget_lines (id) on delete set null,
  code text,
  name text not null,
  budgeted_amount numeric(14,2) check (budgeted_amount >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, code)
);
create index budget_lines_project_idx on budget_lines (project_id);
create index budget_lines_parent_idx on budget_lines (parent_id);

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  filename text not null,
  imported_at timestamptz not null default now(),
  rows_read integer not null default 0,
  rows_inserted integer not null default 0,
  rows_duplicate integer not null default 0,
  rows_unmapped integer not null default 0
);
create index import_batches_project_idx on import_batches (project_id, imported_at desc);

create table ledger_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  budget_line_id uuid references budget_lines (id) on delete set null,
  entry_date date not null,
  amount numeric(14,2) not null,
  kind text not null check (kind in ('despesa','baixa','manual')),
  description text,
  account_code text,
  account_name text,
  cost_center_code text,
  voucher text,
  journal text,
  document text,
  reference text,
  vendor_doc text,
  vendor_name text,
  payment_date date,
  document_date date,
  urls jsonb not null default '{}'::jsonb,
  source text not null check (source in ('import','manual')),
  import_batch_id uuid references import_batches (id) on delete set null,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ledger_entries_project_date_idx on ledger_entries (project_id, entry_date desc);
create index ledger_entries_line_idx on ledger_entries (budget_line_id);
create index ledger_entries_batch_idx on ledger_entries (import_batch_id);

-- Idempotência do import: o par Comprovante+Diário identifica o lançamento no razão.
create unique index ledger_entries_import_key
  on ledger_entries (project_id, voucher, journal)
  where source = 'import';

-- Acesso exclusivamente por service role: RLS ligada, nenhuma policy criada.
alter table projects        enable row level security;
alter table budget_lines    enable row level security;
alter table ledger_entries  enable row level security;
alter table import_batches  enable row level security;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Aplicar a migration**

Use a ferramenta `apply_migration` do MCP Supabase (project_ref `pseksrhwsgfoyackzahb`), com nome `0001_initial_schema` e o conteúdo do arquivo acima.

Verifique com `list_tables`. Esperado: as quatro tabelas presentes, todas com RLS habilitada.

- [ ] **Step 3: Escrever `lib/supabase/types.ts`**

```ts
export type ProjectStatus = 'planejamento' | 'ativo' | 'encerrado';
export type EntryKind = 'despesa' | 'baixa' | 'manual';
export type EntrySource = 'import' | 'manual';

export type EntryUrls = {
  requisicao?: string | null;
  recebimento?: string | null;
  nota_fiscal?: string | null;
  comprovante?: string | null;
};

export type ProjectRow = {
  id: string;
  code: string;
  name: string;
  total_budget: string;
  start_date: string | null;
  end_date: string | null;
  status: ProjectStatus;
  transfer_limit_pct: string;
  warning_threshold_pct: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BudgetLineRow = {
  id: string;
  project_id: string;
  parent_id: string | null;
  code: string | null;
  name: string;
  budgeted_amount: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type LedgerEntryRow = {
  id: string;
  project_id: string;
  budget_line_id: string | null;
  entry_date: string;
  amount: string;
  kind: EntryKind;
  description: string | null;
  account_code: string | null;
  account_name: string | null;
  cost_center_code: string | null;
  voucher: string | null;
  journal: string | null;
  document: string | null;
  reference: string | null;
  vendor_doc: string | null;
  vendor_name: string | null;
  payment_date: string | null;
  document_date: string | null;
  urls: EntryUrls;
  source: EntrySource;
  import_batch_id: string | null;
  raw: Record<string, string> | null;
  created_at: string;
  updated_at: string;
};

export type ImportBatchRow = {
  id: string;
  project_id: string;
  filename: string;
  imported_at: string;
  rows_read: number;
  rows_inserted: number;
  rows_duplicate: number;
  rows_unmapped: number;
};

export type ProjectInsert = Omit<ProjectRow, 'id' | 'created_at' | 'updated_at'>;
export type BudgetLineInsert = Omit<BudgetLineRow, 'id' | 'created_at' | 'updated_at'>;
export type LedgerEntryInsert = Omit<LedgerEntryRow, 'id' | 'created_at' | 'updated_at'>;

export type Database = {
  public: {
    Tables: {
      projects:       { Row: ProjectRow;      Insert: ProjectInsert;      Update: Partial<ProjectInsert> };
      budget_lines:   { Row: BudgetLineRow;   Insert: BudgetLineInsert;   Update: Partial<BudgetLineInsert> };
      ledger_entries: { Row: LedgerEntryRow;  Insert: LedgerEntryInsert;  Update: Partial<LedgerEntryInsert> };
      import_batches: { Row: ImportBatchRow;  Insert: Omit<ImportBatchRow, 'id' | 'imported_at'>; Update: Partial<ImportBatchRow> };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
```

Campos `numeric` são tipados como `string` de propósito: é o que o PostgREST devolve.

- [ ] **Step 4: Escrever `lib/supabase/admin.ts`**

```ts
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

/**
 * Cliente com service role. Só pode ser usado em Server Actions e Route
 * Handlers — o import de 'server-only' faz o build falhar se vazar para
 * um Client Component.
 */
export function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

```bash
npm install server-only
```

- [ ] **Step 5: Verificar**

```bash
npm run build
```

Esperado: build sem erro de tipo.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: schema inicial, tipos e cliente admin do Supabase"
```

---

### Task 3: Cálculo de orçamento e alertas

Lógica pura, sem I/O. É o coração do produto e não depende de nenhuma outra task além da 1 — pode ser feita em paralelo com a Task 2.

**Files:**
- Create: `lib/domain/budget.ts`
- Test: `lib/domain/budget.test.ts`

**Interfaces:**
- Consumes: nada
- Produces:
  - `summarizeProject(project: ProjectInput, lines: LineInput[], entries: EntryInput[]): ProjectSummary`
  - Tipos `ProjectInput`, `LineInput`, `EntryInput`, `LineResult`, `ProjectSummary`, `AlertStatus`

- [ ] **Step 1: Escrever o teste que falha**

`lib/domain/budget.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { summarizeProject, type LineInput, type EntryInput, type ProjectInput } from './budget';

const project: ProjectInput = {
  totalBudget: 100,
  transferLimitPct: 25,
  warningThresholdPct: 80,
};

function line(id: string, budgeted: number | null, parentId: string | null = null): LineInput {
  return { id, parentId, code: id, name: id, budgetedAmount: budgeted, sortOrder: 0 };
}

function entry(lineId: string | null, amount: number, kind: EntryInput['kind'] = 'despesa'): EntryInput {
  return { budgetLineId: lineId, amount, kind };
}

describe('summarizeProject', () => {
  it('soma o realizado por rubrica e calcula saldo', () => {
    const s = summarizeProject(project, [line('a', 10)], [entry('a', 4), entry('a', 3)]);
    expect(s.lines[0].realized).toBe(7);
    expect(s.lines[0].balance).toBe(3);
    expect(s.lines[0].excess).toBe(0);
    expect(s.realized).toBe(7);
    expect(s.available).toBe(93);
  });

  it('conta só o excesso: economia não abate estouro', () => {
    const lines = [line('a', 10), line('b', 10), line('c', 10)];
    const entries = [entry('a', 22), entry('b', 18), entry('c', 4)];
    const s = summarizeProject(project, lines, entries);
    expect(s.lines[0].excess).toBe(12);
    expect(s.lines[1].excess).toBe(8);
    expect(s.lines[2].excess).toBe(0);
    expect(s.transferred).toBe(20);
  });

  it('calcula o teto e o consumo do teto', () => {
    const lines = [line('a', 10), line('b', 10)];
    const s = summarizeProject(project, lines, [entry('a', 22), entry('b', 18)]);
    expect(s.transferCap).toBe(25);
    expect(s.capUsagePct).toBe(80);
    expect(s.status).toBe('aviso');
  });

  it('fica ok abaixo do limiar de aviso', () => {
    const s = summarizeProject(project, [line('a', 10)], [entry('a', 15)]);
    expect(s.transferred).toBe(5);
    expect(s.capUsagePct).toBe(20);
    expect(s.status).toBe('ok');
  });

  it('viola quando o remanejado passa do teto', () => {
    const s = summarizeProject(project, [line('a', 10)], [entry('a', 40)]);
    expect(s.transferred).toBe(30);
    expect(s.status).toBe('violacao');
  });

  it('viola quando o realizado passa do total do projeto', () => {
    const lines = [line('a', 50), line('b', 50)];
    const s = summarizeProject(project, lines, [entry('a', 60), entry('b', 55)]);
    expect(s.overBudget).toBe(true);
    expect(s.status).toBe('violacao');
  });

  it('rubrica sem orçamento não gera excesso e é contabilizada à parte', () => {
    const lines = [line('a', 10), line('b', null)];
    const s = summarizeProject(project, lines, [entry('a', 8), entry('b', 30)]);
    expect(s.transferred).toBe(0);
    expect(s.linesWithoutBudget).toBe(1);
    expect(s.realized).toBe(38);
    expect(s.lines[1].balance).toBeNull();
    expect(s.lines[1].excess).toBe(0);
  });

  it('rubrica-pai acumula o realizado das filhas sem dupla contagem', () => {
    const lines = [line('pai', 20), line('f1', null, 'pai'), line('f2', null, 'pai')];
    const entries = [entry('f1', 12), entry('f2', 13)];
    const s = summarizeProject(project, lines, entries);
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0].realized).toBe(25);
    expect(s.lines[0].children).toHaveLength(2);
    expect(s.lines[0].children[0].realized).toBe(12);
    expect(s.transferred).toBe(5);
    expect(s.realized).toBe(25);
  });

  it('ignora baixas no realizado e no teto, somando à parte', () => {
    const s = summarizeProject(project, [line('a', 10)], [entry('a', 15), entry('a', -41, 'baixa')]);
    expect(s.realized).toBe(15);
    expect(s.transferred).toBe(5);
    expect(s.writeoffs).toBe(-41);
  });

  it('conta lançamento manual no realizado', () => {
    const s = summarizeProject(project, [line('a', 10)], [entry('a', 5, 'manual')]);
    expect(s.realized).toBe(5);
  });

  it('agrupa lançamento sem rubrica em unclassifiedTotal', () => {
    const s = summarizeProject(project, [line('a', 10)], [entry('a', 5), entry(null, 7)]);
    expect(s.unclassifiedTotal).toBe(7);
    expect(s.realized).toBe(12);
    expect(s.transferred).toBe(0);
  });

  it('respeita limites customizados do projeto', () => {
    const custom: ProjectInput = { totalBudget: 200, transferLimitPct: 10, warningThresholdPct: 50 };
    const s = summarizeProject(custom, [line('a', 100)], [entry('a', 111)]);
    expect(s.transferCap).toBe(20);
    expect(s.transferred).toBe(11);
    expect(s.capUsagePct).toBe(55);
    expect(s.status).toBe('aviso');
  });

  it('trata teto zero sem dividir por zero', () => {
    const zero: ProjectInput = { totalBudget: 100, transferLimitPct: 0, warningThresholdPct: 80 };
    const semEstouro = summarizeProject(zero, [line('a', 10)], [entry('a', 8)]);
    expect(semEstouro.capUsagePct).toBe(0);
    expect(semEstouro.status).toBe('ok');

    const comEstouro = summarizeProject(zero, [line('a', 10)], [entry('a', 12)]);
    expect(comEstouro.capUsagePct).toBe(100);
    expect(comEstouro.status).toBe('violacao');
  });

  it('ordena rubricas por sortOrder e depois por código', () => {
    const lines: LineInput[] = [
      { id: 'z', parentId: null, code: '999', name: 'z', budgetedAmount: 1, sortOrder: 5 },
      { id: 'a', parentId: null, code: '111', name: 'a', budgetedAmount: 1, sortOrder: 1 },
    ];
    const s = summarizeProject(project, lines, []);
    expect(s.lines.map((l) => l.id)).toEqual(['a', 'z']);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm test -- lib/domain/budget.test.ts
```

Esperado: FAIL — `Failed to resolve import "./budget"`.

- [ ] **Step 3: Implementar `lib/domain/budget.ts`**

```ts
export type AlertStatus = 'ok' | 'aviso' | 'violacao';
export type EntryKind = 'despesa' | 'baixa' | 'manual';

export type ProjectInput = {
  totalBudget: number;
  transferLimitPct: number;
  warningThresholdPct: number;
};

export type LineInput = {
  id: string;
  parentId: string | null;
  code: string | null;
  name: string;
  budgetedAmount: number | null;
  sortOrder: number;
};

export type EntryInput = {
  budgetLineId: string | null;
  amount: number;
  kind: EntryKind;
};

export type LineResult = {
  id: string;
  code: string | null;
  name: string;
  budgeted: number | null;
  /** Realizado próprio + de todos os descendentes. Exclui baixas. */
  realized: number;
  /** null quando a rubrica não tem orçamento definido. */
  balance: number | null;
  /** max(0, realizado − orçado). Zero em rubrica sem orçamento. */
  excess: number;
  /** Percentual de execução, ou null sem orçamento. */
  executionPct: number | null;
  /** True quando budgeted !== null — é onde o excesso é medido. */
  isControl: boolean;
  children: LineResult[];
};

export type ProjectSummary = {
  totalBudget: number;
  realized: number;
  available: number;
  transferred: number;
  transferCap: number;
  capUsagePct: number;
  writeoffs: number;
  unclassifiedTotal: number;
  linesWithoutBudget: number;
  overBudget: boolean;
  status: AlertStatus;
  lines: LineResult[];
};

/** Arredonda a 2 casas evitando o resíduo binário de somas de float. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function sortLines(a: LineInput, b: LineInput): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return (a.code ?? a.name).localeCompare(b.code ?? b.name, 'pt-BR');
}

export function summarizeProject(
  project: ProjectInput,
  lines: LineInput[],
  entries: EntryInput[],
): ProjectSummary {
  // Realizado próprio de cada rubrica. Baixas ficam de fora.
  const ownRealized = new Map<string, number>();
  let writeoffs = 0;
  let unclassifiedTotal = 0;

  for (const e of entries) {
    if (e.kind === 'baixa') {
      writeoffs += e.amount;
      continue;
    }
    if (e.budgetLineId === null) {
      unclassifiedTotal += e.amount;
      continue;
    }
    ownRealized.set(e.budgetLineId, (ownRealized.get(e.budgetLineId) ?? 0) + e.amount);
  }

  const byParent = new Map<string | null, LineInput[]>();
  for (const l of lines) {
    const bucket = byParent.get(l.parentId) ?? [];
    bucket.push(l);
    byParent.set(l.parentId, bucket);
  }

  let transferred = 0;
  let linesWithoutBudget = 0;
  let classifiedRealized = 0;

  function build(input: LineInput): LineResult {
    const children = (byParent.get(input.id) ?? []).sort(sortLines).map(build);
    const own = ownRealized.get(input.id) ?? 0;
    const realized = round2(own + children.reduce((acc, c) => acc + c.realized, 0));
    const budgeted = input.budgetedAmount;
    const isControl = budgeted !== null;

    // Só o realizado próprio entra no total do projeto; o do filho já foi somado
    // quando o filho foi construído. Isso evita dupla contagem na hierarquia.
    classifiedRealized += own;

    let excess = 0;
    if (isControl) {
      excess = round2(Math.max(0, realized - budgeted));
      transferred += excess;
    } else if (realized > 0) {
      linesWithoutBudget += 1;
    }

    return {
      id: input.id,
      code: input.code,
      name: input.name,
      budgeted,
      realized,
      balance: isControl ? round2(budgeted - realized) : null,
      excess,
      executionPct: isControl && budgeted > 0 ? round2((realized / budgeted) * 100) : null,
      isControl,
      children,
    };
  }

  const tree = (byParent.get(null) ?? []).sort(sortLines).map(build);

  const realized = round2(classifiedRealized + unclassifiedTotal);
  const transferCap = round2((project.totalBudget * project.transferLimitPct) / 100);
  transferred = round2(transferred);

  let capUsagePct: number;
  if (transferCap > 0) {
    capUsagePct = round2((transferred / transferCap) * 100);
  } else {
    // Sem teto configurado, qualquer remanejamento já é violação.
    capUsagePct = transferred > 0 ? 100 : 0;
  }

  const overBudget = realized > project.totalBudget;
  const violated = transferred > transferCap || overBudget;

  let status: AlertStatus = 'ok';
  if (violated) status = 'violacao';
  else if (capUsagePct >= project.warningThresholdPct) status = 'aviso';

  return {
    totalBudget: project.totalBudget,
    realized,
    available: round2(project.totalBudget - realized),
    transferred,
    transferCap,
    capUsagePct,
    writeoffs: round2(writeoffs),
    unclassifiedTotal: round2(unclassifiedTotal),
    linesWithoutBudget,
    overBudget,
    status,
    lines: tree,
  };
}
```

- [ ] **Step 4: Rodar até passar**

```bash
npm test -- lib/domain/budget.test.ts
```

Esperado: PASS, 14 testes.

Atenção ao caso do teto zero com estouro: `transferCap` é 0 e `transferred` é 2, então `transferred > transferCap` é verdadeiro e o status vira `violacao` — como o teste exige.

- [ ] **Step 5: Adaptador de linha do banco**

Acrescente ao fim de `lib/domain/budget.ts`. Converte as `string` numéricas do PostgREST.

```ts
import type { ProjectRow, BudgetLineRow, LedgerEntryRow } from '@/lib/supabase/types';

export function toProjectInput(row: ProjectRow): ProjectInput {
  return {
    totalBudget: Number(row.total_budget),
    transferLimitPct: Number(row.transfer_limit_pct),
    warningThresholdPct: Number(row.warning_threshold_pct),
  };
}

export function toLineInput(row: BudgetLineRow): LineInput {
  return {
    id: row.id,
    parentId: row.parent_id,
    code: row.code,
    name: row.name,
    budgetedAmount: row.budgeted_amount === null ? null : Number(row.budgeted_amount),
    sortOrder: row.sort_order,
  };
}

export function toEntryInput(row: LedgerEntryRow): EntryInput {
  return {
    budgetLineId: row.budget_line_id,
    amount: Number(row.amount),
    kind: row.kind,
  };
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/domain/budget.ts lib/domain/budget.test.ts
git commit -m "feat: cálculo de execução orçamentária e teto de remanejamento"
```

---

### Task 4: Senha única do aplicativo

**Files:**
- Create: `lib/auth/session.ts`
- Test: `lib/auth/session.test.ts`
- Create: `app/api/auth/route.ts`
- Create: `app/login/page.tsx`, `app/login/_view.tsx`
- Modify: `proxy.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: Task 1
- Produces:
  - `SESSION_COOKIE: string`
  - `createSessionToken(secret: string, now?: number): Promise<string>`
  - `verifySessionToken(token: string | undefined, secret: string, now?: number): Promise<boolean>`

- [ ] **Step 1: Ampliar o escopo do Vitest**

`vitest.config.ts` — `include` cobria só `lib/**`, o que já basta, mas o padrão precisa aceitar subpastas novas. Confirme que está assim:

```ts
include: ['lib/**/*.test.ts'],
```

Nenhuma mudança necessária se já estiver. Prossiga.

- [ ] **Step 2: Escrever o teste que falha**

`lib/auth/session.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createSessionToken, verifySessionToken } from './session';

const SECRET = 'segredo-de-teste-com-tamanho-razoavel';
const NOW = 1_700_000_000_000;

describe('sessão por senha única', () => {
  it('aceita um token que ela mesma emitiu', async () => {
    const token = await createSessionToken(SECRET, NOW);
    expect(await verifySessionToken(token, SECRET, NOW)).toBe(true);
  });

  it('rejeita token assinado com outro segredo', async () => {
    const token = await createSessionToken('outro-segredo', NOW);
    expect(await verifySessionToken(token, SECRET, NOW)).toBe(false);
  });

  it('rejeita token adulterado', async () => {
    const token = await createSessionToken(SECRET, NOW);
    const [payload, mac] = token.split('.');
    expect(await verifySessionToken(`${Number(payload) + 1}.${mac}`, SECRET, NOW)).toBe(false);
  });

  it('rejeita token expirado', async () => {
    const token = await createSessionToken(SECRET, NOW);
    const trintaEUmDias = 31 * 24 * 60 * 60 * 1000;
    expect(await verifySessionToken(token, SECRET, NOW + trintaEUmDias)).toBe(false);
  });

  it('aceita token dentro da validade', async () => {
    const token = await createSessionToken(SECRET, NOW);
    const vinteENoveDias = 29 * 24 * 60 * 60 * 1000;
    expect(await verifySessionToken(token, SECRET, NOW + vinteENoveDias)).toBe(true);
  });

  it('rejeita undefined e lixo', async () => {
    expect(await verifySessionToken(undefined, SECRET, NOW)).toBe(false);
    expect(await verifySessionToken('', SECRET, NOW)).toBe(false);
    expect(await verifySessionToken('abc', SECRET, NOW)).toBe(false);
    expect(await verifySessionToken('abc.def', SECRET, NOW)).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
npm test -- lib/auth/session.test.ts
```

Esperado: FAIL — `Failed to resolve import "./session"`.

- [ ] **Step 4: Implementar `lib/auth/session.ts`**

Web Crypto apenas — este módulo é importado pelo `proxy.ts`, que roda em Edge.

```ts
export const SESSION_COOKIE = 'farol_session';
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const encoder = new TextEncoder();

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Comparação em tempo constante — evita descobrir o MAC byte a byte. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function createSessionToken(secret: string, now = Date.now()): Promise<string> {
  const payload = String(now);
  return `${payload}.${await sign(payload, secret)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [payload, mac] = parts;
  const issuedAt = Number(payload);
  if (!Number.isFinite(issuedAt)) return false;
  if (now - issuedAt > SESSION_MAX_AGE_SECONDS * 1000) return false;
  if (issuedAt > now) return false;

  return safeEqual(await sign(payload, secret), mac);
}
```

- [ ] **Step 5: Rodar até passar**

```bash
npm test -- lib/auth/session.test.ts
```

Esperado: PASS, 6 testes.

- [ ] **Step 6: Route Handler de login**

`app/api/auth/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '@/lib/auth/session';

export async function POST(request: Request) {
  const { password } = (await request.json()) as { password?: string };
  const expected = process.env.APP_PASSWORD;
  const secret = process.env.SESSION_SECRET;

  if (!expected || !secret) {
    return NextResponse.json({ error: 'Aplicativo sem senha configurada.' }, { status: 500 });
  }
  if (password !== expected) {
    return NextResponse.json({ error: 'Senha incorreta.' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(secret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
```

- [ ] **Step 7: Tela de login**

`app/login/page.tsx`:

```tsx
import { LoginView } from './_view';

export default function LoginPage() {
  return <LoginView />;
}
```

`app/login/_view.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';

export function LoginView() {
  const [password, setPassword] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      const { error } = await response.json();
      toast.error(error ?? 'Não foi possível entrar.');
      return;
    }
    startTransition(() => {
      router.replace('/');
      router.refresh();
    });
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="font-display text-2xl">Farol de Projetos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Informe a senha de acesso.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending || password.length === 0}>
            Entrar
          </Button>
        </form>
      </Card>
    </main>
  );
}
```

- [ ] **Step 8: Escrever o `proxy.ts` real**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

const PUBLIC_PATHS = ['/login', '/api/auth'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const secret = process.env.SESSION_SECRET;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (secret && (await verifySessionToken(token, secret))) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

- [ ] **Step 9: Verificar manualmente**

```bash
npm run dev
```

Abra `http://localhost:3000`. Esperado: redireciona para `/login`. Senha errada mostra toast de erro; a senha de `APP_PASSWORD` leva para a lista de projetos. Recarregue a página: continua dentro (cookie persistido).

```bash
npm run build && npm test
```

Esperado: build sem erro, todos os testes passando.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: acesso por senha única com cookie assinado"
```

---

### Task 5: Parser do razão

**Files:**
- Create: `lib/domain/ledger-import.ts`
- Test: `lib/domain/ledger-import.test.ts`

**Interfaces:**
- Consumes: Task 1
- Produces:
  - `LEDGER_HEADERS: readonly string[]`
  - `parseLedgerRows(rows: string[][]): ParseResult`
  - `readWorkbookRows(buffer: ArrayBuffer): Promise<string[][]>`
  - Tipos `ParsedEntry`, `ParseResult`, `CenterSummary`

- [ ] **Step 1: Escrever o teste que falha**

`lib/domain/ledger-import.test.ts`. As linhas replicam a estrutura real do arquivo do Genus, com fornecedores e documentos fictícios.

```ts
import { describe, it, expect } from 'vitest';
import { parseLedgerRows, LEDGER_HEADERS } from './ledger-import';

const HEADER = [...LEDGER_HEADERS];

function row(over: Partial<Record<string, string>> = {}): string[] {
  const base: Record<string, string> = {
    'Data': '30/04/2026',
    'Entidade': 'Sesi/Al',
    'Filial': '2831',
    'Unidade': '043001 - Projetos Estratégicos',
    'Centro': '30413070101 - Estruturante 2026 - Capacitações E Treinamentos',
    'Conta': '31010401001 - Passagens Nacionais',
    'Valor': '7795.41',
    'Comprovante': 'CONTAB000197595',
    'Diário': '2-02104071',
    'Data_do_Pagamento': '',
    'Data do Documento': '',
    'Descrição': 'Compra referente NF 000000 - FORNECEDOR EXEMPLO LTDA | PASSAGEM',
    'Texto de linha': '',
    'Referência': '',
    'CNPJ/CPF': '00.000.000/0001-00',
    'RAZÃO SOCIAL/NOME': 'FORNECEDOR EXEMPLO LTDA',
    'Requisição': '',
    'URL Requisição': '',
    'Recebimento': '',
    'URL Recebimento': '',
    'Documento': '',
    'URL Nota Fiscal': '',
    'URL Comprovante': 'https://exemplo.invalid/comprovante?id=1',
  };
  return HEADER.map((h) => over[h] ?? base[h] ?? '');
}

describe('parseLedgerRows', () => {
  it('extrai os campos de uma linha de despesa', () => {
    const { entries } = parseLedgerRows([HEADER, row()]);
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.entryDate).toBe('2026-04-30');
    expect(e.amount).toBe(7795.41);
    expect(e.kind).toBe('despesa');
    expect(e.costCenterCode).toBe('30413070101');
    expect(e.costCenterName).toBe('Estruturante 2026 - Capacitações E Treinamentos');
    expect(e.accountCode).toBe('31010401001');
    expect(e.accountName).toBe('Passagens Nacionais');
    expect(e.voucher).toBe('CONTAB000197595');
    expect(e.journal).toBe('2-02104071');
    expect(e.vendorName).toBe('FORNECEDOR EXEMPLO LTDA');
    expect(e.urls.comprovante).toBe('https://exemplo.invalid/comprovante?id=1');
  });

  it('separa código e nome no primeiro hífen, preservando hífens do nome', () => {
    const { entries } = parseLedgerRows([HEADER, row()]);
    expect(entries[0].costCenterName).toContain('Estruturante 2026 - Capacitações');
  });

  it('classifica conta 4xxx negativa como baixa', () => {
    const baixa = row({
      'Conta': '41020304001 - Projetos Estratégicos',
      'Valor': '-41156.24',
      'Descrição': 'BAIXA DE PROJETOS',
      'Comprovante': 'RECEITAS000047236',
      'Diário': '2-02160197',
    });
    const { entries } = parseLedgerRows([HEADER, baixa]);
    expect(entries[0].kind).toBe('baixa');
    expect(entries[0].amount).toBe(-41156.24);
  });

  it('conta 4xxx com valor positivo continua despesa', () => {
    const { entries } = parseLedgerRows([HEADER, row({ 'Conta': '41020304001 - X', 'Valor': '10' })]);
    expect(entries[0].kind).toBe('despesa');
  });

  it('descarta a linha Total do rodapé', () => {
    const total = HEADER.map((h) => (h === 'Data' ? 'Total' : h === 'Valor' ? '7262.87' : ''));
    const result = parseLedgerRows([HEADER, row(), total]);
    expect(result.entries).toHaveLength(1);
    expect(result.discardedRows).toBe(1);
  });

  it('descarta a linha de filtros aplicados', () => {
    const filtros = HEADER.map((h) => (h === 'Data' ? 'Filtros aplicados:\nTipo não é Outro' : ''));
    const result = parseLedgerRows([HEADER, row(), filtros]);
    expect(result.entries).toHaveLength(1);
    expect(result.discardedRows).toBe(1);
  });

  it('descarta linha totalmente vazia', () => {
    const result = parseLedgerRows([HEADER, row(), HEADER.map(() => '')]);
    expect(result.entries).toHaveLength(1);
    expect(result.discardedRows).toBe(1);
  });

  it('agrupa centros de custo com contagem e total', () => {
    const outro = row({
      'Centro': '30413070102 - Outro Projeto',
      'Valor': '100',
      'Comprovante': 'CONTAB2',
      'Diário': '2-2',
    });
    const { centers } = parseLedgerRows([HEADER, row(), outro]);
    expect(centers).toHaveLength(2);
    const c = centers.find((x) => x.code === '30413070102')!;
    expect(c.name).toBe('Outro Projeto');
    expect(c.count).toBe(1);
    expect(c.total).toBe(100);
  });

  it('lê valor com vírgula decimal e separador de milhar', () => {
    const { entries } = parseLedgerRows([HEADER, row({ 'Valor': '1.234,56' })]);
    expect(entries[0].amount).toBe(1234.56);
  });

  it('converte datas opcionais e mantém null quando ausentes', () => {
    const { entries } = parseLedgerRows([
      HEADER,
      row({ 'Data_do_Pagamento': '15/05/2026', 'Data do Documento': '' }),
    ]);
    expect(entries[0].paymentDate).toBe('2026-05-15');
    expect(entries[0].documentDate).toBeNull();
  });

  it('rejeita cabeçalho que não é do razão', () => {
    expect(() => parseLedgerRows([['Coluna A', 'Coluna B'], ['1', '2']])).toThrow(
      /não parece ser o razão/i,
    );
  });

  it('preserva a linha original em raw para auditoria', () => {
    const { entries } = parseLedgerRows([HEADER, row()]);
    expect(entries[0].raw['Comprovante']).toBe('CONTAB000197595');
  });

  it('tolera linha mais curta que o cabeçalho', () => {
    const curta = row().slice(0, 9);
    const { entries } = parseLedgerRows([HEADER, curta]);
    expect(entries).toHaveLength(1);
    expect(entries[0].vendorName).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm test -- lib/domain/ledger-import.test.ts
```

Esperado: FAIL — `Failed to resolve import "./ledger-import"`.

- [ ] **Step 3: Implementar `lib/domain/ledger-import.ts`**

```ts
import type { EntryUrls } from '@/lib/supabase/types';

export const LEDGER_HEADERS = [
  'Data',
  'Entidade',
  'Filial',
  'Unidade',
  'Centro',
  'Conta',
  'Valor',
  'Comprovante',
  'Diário',
  'Data_do_Pagamento',
  'Data do Documento',
  'Descrição',
  'Texto de linha',
  'Referência',
  'CNPJ/CPF',
  'RAZÃO SOCIAL/NOME',
  'Requisição',
  'URL Requisição',
  'Recebimento',
  'URL Recebimento',
  'Documento',
  'URL Nota Fiscal',
  'URL Comprovante',
] as const;

export type ParsedEntry = {
  costCenterCode: string;
  costCenterName: string;
  accountCode: string;
  accountName: string;
  entryDate: string;
  amount: number;
  kind: 'despesa' | 'baixa';
  description: string | null;
  voucher: string | null;
  journal: string | null;
  document: string | null;
  reference: string | null;
  vendorDoc: string | null;
  vendorName: string | null;
  paymentDate: string | null;
  documentDate: string | null;
  urls: EntryUrls;
  raw: Record<string, string>;
};

export type CenterSummary = {
  code: string;
  name: string;
  count: number;
  total: number;
};

export type ParseResult = {
  entries: ParsedEntry[];
  discardedRows: number;
  centers: CenterSummary[];
};

/** Separa "31010401001 - Passagens Nacionais" no PRIMEIRO hífen. */
function splitCodeName(value: string): { code: string; name: string } {
  const idx = value.indexOf(' - ');
  if (idx === -1) return { code: value.trim(), name: '' };
  return { code: value.slice(0, idx).trim(), name: value.slice(idx + 3).trim() };
}

/** 'dd/MM/yyyy' -> 'yyyy-MM-dd'. Devolve null se não casar. */
function parseBRDate(value: string): string | null {
  const m = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * O Genus exporta valor como número (ponto decimal), mas planilhas reabertas
 * no Excel pt-BR podem sair como '1.234,56'. Aceita os dois.
 */
function parseAmount(value: string): number {
  const raw = value.trim();
  if (raw === '') return 0;
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function nullIfEmpty(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function parseLedgerRows(rows: string[][]): ParseResult {
  if (rows.length === 0) {
    throw new Error('A planilha está vazia.');
  }

  const header = rows[0].map((h) => h.trim());
  const missing = LEDGER_HEADERS.filter((h) => !header.includes(h));
  if (missing.length > 0) {
    throw new Error(
      `A planilha não parece ser o razão do Genus. Colunas ausentes: ${missing.join(', ')}.`,
    );
  }

  const at = (row: string[], column: (typeof LEDGER_HEADERS)[number]): string =>
    (row[header.indexOf(column)] ?? '').toString();

  const entries: ParsedEntry[] = [];
  let discardedRows = 0;

  for (const row of rows.slice(1)) {
    const centro = at(row, 'Centro').trim();
    // Rodapé do relatório (linha 'Total' e linha 'Filtros aplicados:') e linhas
    // em branco nunca têm centro de custo.
    if (centro === '') {
      discardedRows += 1;
      continue;
    }

    const entryDate = parseBRDate(at(row, 'Data'));
    if (entryDate === null) {
      discardedRows += 1;
      continue;
    }

    const center = splitCodeName(centro);
    const account = splitCodeName(at(row, 'Conta'));
    const amount = parseAmount(at(row, 'Valor'));

    const raw: Record<string, string> = {};
    for (const column of LEDGER_HEADERS) {
      raw[column] = at(row, column);
    }

    entries.push({
      costCenterCode: center.code,
      costCenterName: center.name,
      accountCode: account.code,
      accountName: account.name,
      entryDate,
      amount,
      // Contas do grupo 4 com valor negativo são a contrapartida contábil
      // (baixa de projeto), não despesa.
      kind: account.code.startsWith('4') && amount < 0 ? 'baixa' : 'despesa',
      description: nullIfEmpty(at(row, 'Descrição')),
      voucher: nullIfEmpty(at(row, 'Comprovante')),
      journal: nullIfEmpty(at(row, 'Diário')),
      document: nullIfEmpty(at(row, 'Documento')),
      reference: nullIfEmpty(at(row, 'Referência')),
      vendorDoc: nullIfEmpty(at(row, 'CNPJ/CPF')),
      vendorName: nullIfEmpty(at(row, 'RAZÃO SOCIAL/NOME')),
      paymentDate: parseBRDate(at(row, 'Data_do_Pagamento')),
      documentDate: parseBRDate(at(row, 'Data do Documento')),
      urls: {
        requisicao: nullIfEmpty(at(row, 'URL Requisição')),
        recebimento: nullIfEmpty(at(row, 'URL Recebimento')),
        nota_fiscal: nullIfEmpty(at(row, 'URL Nota Fiscal')),
        comprovante: nullIfEmpty(at(row, 'URL Comprovante')),
      },
      raw,
    });
  }

  const centerMap = new Map<string, CenterSummary>();
  for (const e of entries) {
    const current = centerMap.get(e.costCenterCode) ?? {
      code: e.costCenterCode,
      name: e.costCenterName,
      count: 0,
      total: 0,
    };
    current.count += 1;
    current.total = Math.round((current.total + e.amount) * 100) / 100;
    centerMap.set(e.costCenterCode, current);
  }

  return {
    entries,
    discardedRows,
    centers: [...centerMap.values()].sort((a, b) => a.code.localeCompare(b.code)),
  };
}
```

- [ ] **Step 4: Rodar até passar**

```bash
npm test -- lib/domain/ledger-import.test.ts
```

Esperado: PASS, 13 testes.

- [ ] **Step 5: Leitor de workbook**

Acrescente ao fim de `lib/domain/ledger-import.ts`. Fica separado do parser porque a biblioteca de planilha é pesada e só roda em Node — o parser puro continua testável sem ela.

**Use SheetJS, não ExcelJS.** O ExcelJS não abre o arquivo que o Genus gera: o export escreve o XML interno com prefixo de namespace (`<x:row>`, `<x:c>`) e sem os atributos `r=` de referência de célula. É XML válido, mas o ExcelJS falha com `Cannot read properties of undefined (reading 'sheets')`. Verificado contra o arquivo real.

O SheetJS entra **vendorizado**, porque a versão publicada no npm é a `0.18.5` e carrega dois advisories *high* (prototype pollution e ReDoS); a `0.20.3` corrige ambos mas só é distribuída pelo CDN da SheetJS. Vendorizar evita as CVEs e não faz o build da Vercel depender do CDN:

```bash
mkdir -p vendor
curl -sS -o vendor/xlsx-0.20.3.tgz https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
npm i file:vendor/xlsx-0.20.3.tgz
```

O ExcelJS **continua no projeto** para a escrita do export (Task 12): a formatação de célula que ela precisa — negrito no cabeçalho, `numFmt` de moeda — é recurso pago no SheetJS.

```ts
/**
 * Converte a primeira aba do .xlsx numa matriz de strings.
 * Só é chamado em Route Handler; não roda no browser.
 *
 * Usa SheetJS, não ExcelJS: o Genus escreve o XML interno com prefixo de
 * namespace (`<x:row>`, `<x:c>`) e sem os atributos `r=` de referência de
 * célula. É válido, mas o ExcelJS não abre essa variante.
 */
export async function readWorkbookRows(buffer: ArrayBuffer): Promise<string[][]> {
  const XLSX = await import('xlsx');

  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('A planilha não tem nenhuma aba.');

  const sheet = workbook.Sheets[sheetName];

  // raw: false devolve o texto formatado da célula, então a coluna Data chega
  // como 'dd/MM/yyyy' e parseBRDate a entende. Com raw: true viria o serial
  // numérico do Excel e todo lançamento seria descartado.
  // defval: '' preserva as células vazias, mantendo o alinhamento com o
  // cabeçalho; blankrows: true preserva linhas em branco, que
  // parseLedgerRows precisa ver para contá-las entre as descartadas.
  return XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: true,
  });
}
```

O `raw: false` é o detalhe que faz ou quebra o import: sem ele a coluna `Data` chega como serial numérico do Excel, `parseBRDate` devolve `null` e **todos** os lançamentos são descartados silenciosamente.

- [ ] **Step 6: Verificar contra o arquivo real**

```bash
cd ~/projetos/farol-projetos
cat > /tmp/verifica-razao.mjs <<'EOF'
import { readWorkbookRows, parseLedgerRows } from './lib/domain/ledger-import.ts';
import { readFile } from 'node:fs/promises';

const buf = await readFile(process.env.HOME + '/Downloads/data.xlsx');
const rows = await readWorkbookRows(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const result = parseLedgerRows(rows);
console.log('lançamentos:', result.entries.length);
console.log('descartadas:', result.discardedRows);
console.log('centros:', result.centers);
console.log('baixas:', result.entries.filter((e) => e.kind === 'baixa').length);
const despesas = result.entries.filter((e) => e.kind === 'despesa')
  .reduce((a, e) => a + e.amount, 0);
console.log('total despesas:', despesas.toFixed(2));
EOF
npx tsx /tmp/verifica-razao.mjs
```

Esperado, para o `data.xlsx` de referência:

```
lançamentos: 33
descartadas: 2
centros: [ { code: '30413070101', ..., count: 33, total: 7262.87 } ]
baixas: 1
total despesas: 48419.11
```

As 2 descartadas são a linha `Total` e a linha `Filtros aplicados:`. O arquivo tem 36 linhas no XML: cabeçalho + 33 lançamentos + essas duas. Não há linha em branco no rodapé.

Se `lançamentos` vier 0, o leitor entregou a coluna `Data` como serial numérico do Excel em vez de texto, e `parseBRDate` descartou tudo — inspecione `rows[1][0]` antes de mexer no parser.

Instale `tsx` como dev dependency se necessário: `npm i -D tsx`. Apague o script depois; ele não entra no repositório.

- [ ] **Step 7: Commit**

```bash
git add lib/domain/ledger-import.ts lib/domain/ledger-import.test.ts package.json package-lock.json
git commit -m "feat: parser do razão do Genus com classificação de baixa"
```

---

### Task 6: Resolução do import contra o banco

Segunda metade pura da importação: dado o que o parser leu e o que já existe no banco, decidir o que é novo, o que é duplicado e que rubricas precisam ser criadas.

**Files:**
- Create: `lib/domain/import-resolution.ts`
- Test: `lib/domain/import-resolution.test.ts`

**Interfaces:**
- Consumes: `ParsedEntry` (Task 5)
- Produces:
  - `resolveImport(entries: ParsedEntry[], context: ResolutionContext): ImportPlan`
  - Tipos `ResolutionContext`, `ImportPlan`, `ProjectPlan`, `NewBudgetLine`

- [ ] **Step 1: Escrever o teste que falha**

`lib/domain/import-resolution.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveImport, type ResolutionContext } from './import-resolution';
import type { ParsedEntry } from './ledger-import';

function entry(over: Partial<ParsedEntry> = {}): ParsedEntry {
  return {
    costCenterCode: '30413070101',
    costCenterName: 'Estruturante 2026',
    accountCode: '31010401001',
    accountName: 'Passagens Nacionais',
    entryDate: '2026-04-30',
    amount: 100,
    kind: 'despesa',
    description: null,
    voucher: 'CONTAB1',
    journal: '2-1',
    document: null,
    reference: null,
    vendorDoc: null,
    vendorName: null,
    paymentDate: null,
    documentDate: null,
    urls: {},
    raw: {},
    ...over,
  };
}

const context: ResolutionContext = {
  projectsByCode: {
    '30413070101': { id: 'proj-1', name: 'Estruturante 2026' },
  },
  budgetLinesByProject: {
    'proj-1': [{ id: 'line-1', code: '31010401001' }],
  },
  existingKeysByProject: {
    'proj-1': [],
  },
};

describe('resolveImport', () => {
  it('associa o lançamento ao projeto e à rubrica existentes', () => {
    const plan = resolveImport([entry()], context);
    expect(plan.projects).toHaveLength(1);
    expect(plan.projects[0].projectId).toBe('proj-1');
    expect(plan.projects[0].newEntries).toHaveLength(1);
    expect(plan.projects[0].newEntries[0].budgetLineCode).toBe('31010401001');
    expect(plan.projects[0].newBudgetLines).toHaveLength(0);
  });

  it('marca como duplicado quando voucher+journal já existe', () => {
    const ctx: ResolutionContext = {
      ...context,
      existingKeysByProject: { 'proj-1': ['CONTAB1|2-1'] },
    };
    const plan = resolveImport([entry()], ctx);
    expect(plan.projects[0].newEntries).toHaveLength(0);
    expect(plan.projects[0].duplicateCount).toBe(1);
  });

  it('deduplica dentro do próprio arquivo', () => {
    const plan = resolveImport([entry(), entry()], context);
    expect(plan.projects[0].newEntries).toHaveLength(1);
    expect(plan.projects[0].duplicateCount).toBe(1);
  });

  it('propõe rubrica nova quando a conta não existe', () => {
    const nova = entry({ accountCode: '31010403001', accountName: 'Hospedagens', voucher: 'C2' });
    const plan = resolveImport([nova], context);
    expect(plan.projects[0].newBudgetLines).toEqual([
      { code: '31010403001', name: 'Hospedagens' },
    ]);
    expect(plan.projects[0].unmappedCount).toBe(1);
  });

  it('propõe cada rubrica nova uma única vez', () => {
    const a = entry({ accountCode: '31010403001', accountName: 'Hospedagens', voucher: 'C2' });
    const b = entry({ accountCode: '31010403001', accountName: 'Hospedagens', voucher: 'C3' });
    const plan = resolveImport([a, b], context);
    expect(plan.projects[0].newBudgetLines).toHaveLength(1);
    expect(plan.projects[0].unmappedCount).toBe(2);
  });

  it('separa centros sem projeto cadastrado', () => {
    const orfa = entry({ costCenterCode: '99999', costCenterName: 'Projeto Não Cadastrado' });
    const plan = resolveImport([entry(), orfa], context);
    expect(plan.projects).toHaveLength(1);
    expect(plan.unknownCenters).toEqual([
      { code: '99999', name: 'Projeto Não Cadastrado', count: 1, total: 100 },
    ]);
  });

  it('soma despesas e baixas separadamente no resumo', () => {
    const baixa = entry({ kind: 'baixa', amount: -500, voucher: 'REC1', accountCode: '41020304001' });
    const plan = resolveImport([entry(), baixa], context);
    expect(plan.projects[0].expenseTotal).toBe(100);
    expect(plan.projects[0].writeoffTotal).toBe(-500);
    expect(plan.projects[0].newEntries).toHaveLength(2);
  });

  it('lançamento sem voucher nem journal nunca é tratado como duplicado', () => {
    const semChave = entry({ voucher: null, journal: null });
    const plan = resolveImport([semChave, semChave], context);
    expect(plan.projects[0].newEntries).toHaveLength(2);
    expect(plan.projects[0].duplicateCount).toBe(0);
  });

  it('devolve plano vazio para arquivo sem lançamentos', () => {
    const plan = resolveImport([], context);
    expect(plan.projects).toHaveLength(0);
    expect(plan.unknownCenters).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm test -- lib/domain/import-resolution.test.ts
```

Esperado: FAIL — `Failed to resolve import "./import-resolution"`.

- [ ] **Step 3: Implementar `lib/domain/import-resolution.ts`**

```ts
import type { ParsedEntry } from './ledger-import';

export type ResolutionContext = {
  /** Indexado pelo código do centro de custo. */
  projectsByCode: Record<string, { id: string; name: string }>;
  /** Rubricas já cadastradas, por projeto. */
  budgetLinesByProject: Record<string, { id: string; code: string | null }[]>;
  /** Chaves 'voucher|journal' já importadas, por projeto. */
  existingKeysByProject: Record<string, string[]>;
};

export type NewBudgetLine = { code: string; name: string };

export type PlannedEntry = ParsedEntry & {
  /** Código da conta que resolve a rubrica. Pode apontar para rubrica ainda a criar. */
  budgetLineCode: string;
  /** id da rubrica quando ela já existe; null quando será criada no commit. */
  budgetLineId: string | null;
};

export type ProjectPlan = {
  projectId: string;
  projectName: string;
  centerCode: string;
  newEntries: PlannedEntry[];
  newBudgetLines: NewBudgetLine[];
  duplicateCount: number;
  unmappedCount: number;
  expenseTotal: number;
  writeoffTotal: number;
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

/** Chave de idempotência. null quando o razão não trouxe identificação. */
function importKey(entry: ParsedEntry): string | null {
  if (!entry.voucher && !entry.journal) return null;
  return `${entry.voucher ?? ''}|${entry.journal ?? ''}`;
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
        newBudgetLines: [],
        duplicateCount: 0,
        unmappedCount: 0,
        expenseTotal: 0,
        writeoffTotal: 0,
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

    const existingLine = (context.budgetLinesByProject[project.id] ?? []).find(
      (l) => l.code === entry.accountCode,
    );

    if (!existingLine) {
      plan.unmappedCount += 1;
      if (!plan.newBudgetLines.some((l) => l.code === entry.accountCode)) {
        plan.newBudgetLines.push({ code: entry.accountCode, name: entry.accountName });
      }
    }

    if (entry.kind === 'baixa') {
      plan.writeoffTotal = round2(plan.writeoffTotal + entry.amount);
    } else {
      plan.expenseTotal = round2(plan.expenseTotal + entry.amount);
    }

    plan.newEntries.push({
      ...entry,
      budgetLineCode: entry.accountCode,
      budgetLineId: existingLine?.id ?? null,
    });
  }

  return {
    projects: [...plans.values()],
    unknownCenters: [...unknown.values()],
  };
}
```

- [ ] **Step 4: Rodar até passar**

```bash
npm test -- lib/domain/import-resolution.test.ts
```

Esperado: PASS, 9 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/import-resolution.ts lib/domain/import-resolution.test.ts
git commit -m "feat: resolução do import contra projetos e rubricas existentes"
```

---

### Task 7: CRUD de projetos

**Files:**
- Create: `lib/actions/projects.ts`
- Create: `app/(app)/page.tsx`, `app/(app)/_view.tsx`
- Create: `app/(app)/projetos/novo/page.tsx`
- Create: `app/(app)/projetos/[id]/editar/page.tsx`
- Create: `components/forms/project-form.tsx`
- Create: `lib/domain/project-queries.ts`

**Interfaces:**
- Consumes: `createAdminClient` (Task 2), `summarizeProject`/`toProjectInput`/`toLineInput`/`toEntryInput` (Task 3)
- Produces:
  - `createProject(input: ProjectFormValues): Promise<ActionResult<{ id: string }>>`
  - `updateProject(id: string, input: ProjectFormValues): Promise<ActionResult>`
  - `deleteProject(id: string): Promise<ActionResult>`
  - `projectFormSchema: z.ZodType<ProjectFormValues>`
  - `loadProjectSummary(projectId: string): Promise<{ project: ProjectRow; summary: ProjectSummary } | null>`
  - `type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string }`

- [ ] **Step 1: Criar o schema compartilhado e as actions**

`lib/actions/projects.ts`:

```ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export const projectFormSchema = z.object({
  code: z.string().trim().min(1, 'Informe o código do centro de custo'),
  name: z.string().trim().min(1, 'Informe o nome do projeto'),
  totalBudget: z.number().nonnegative('O valor total não pode ser negativo'),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  status: z.enum(['planejamento', 'ativo', 'encerrado']),
  transferLimitPct: z.number().min(0).max(100),
  warningThresholdPct: z.number().min(0).max(100),
  notes: z.string().nullable(),
});

export type ProjectFormValues = z.infer<typeof projectFormSchema>;

function toRow(input: ProjectFormValues) {
  return {
    code: input.code,
    name: input.name,
    total_budget: input.totalBudget.toFixed(2),
    start_date: input.startDate,
    end_date: input.endDate,
    status: input.status,
    transfer_limit_pct: input.transferLimitPct.toFixed(2),
    warning_threshold_pct: input.warningThresholdPct.toFixed(2),
    notes: input.notes,
  };
}

export async function createProject(
  input: ProjectFormValues,
): Promise<ActionResult<{ id: string }>> {
  const parsed = projectFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('projects')
    .insert(toRow(parsed.data))
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'Já existe um projeto com esse código de centro de custo.' };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath('/');
  return { ok: true, data: { id: data.id } };
}

export async function updateProject(
  id: string,
  input: ProjectFormValues,
): Promise<ActionResult> {
  const parsed = projectFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('projects')
    .update({ ...toRow(parsed.data), updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/');
  revalidatePath(`/projetos/${id}`);
  return { ok: true, data: undefined };
}

export async function deleteProject(id: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/');
  return { ok: true, data: undefined };
}
```

O `revalidatePath` é necessário porque as páginas são `force-dynamic` mas o Router Cache do cliente ainda serve a versão anterior após a navegação.

- [ ] **Step 2: Criar as consultas de leitura**

`lib/domain/project-queries.ts`:

```ts
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ProjectRow, BudgetLineRow, LedgerEntryRow } from '@/lib/supabase/types';
import {
  summarizeProject,
  toProjectInput,
  toLineInput,
  toEntryInput,
  type ProjectSummary,
} from './budget';

export type ProjectWithSummary = {
  project: ProjectRow;
  summary: ProjectSummary;
};

/** Uma linha da lista de projetos: só o necessário para o card. */
export async function listProjectsWithSummary(): Promise<ProjectWithSummary[]> {
  const supabase = createAdminClient();

  const [{ data: projects }, { data: lines }, { data: entries }] = await Promise.all([
    supabase.from('projects').select('*').order('created_at', { ascending: false }),
    supabase.from('budget_lines').select('*'),
    supabase.from('ledger_entries').select('project_id, budget_line_id, amount, kind'),
  ]);

  const linesByProject = new Map<string, BudgetLineRow[]>();
  for (const l of lines ?? []) {
    const bucket = linesByProject.get(l.project_id) ?? [];
    bucket.push(l);
    linesByProject.set(l.project_id, bucket);
  }

  const entriesByProject = new Map<string, Pick<LedgerEntryRow, 'project_id' | 'budget_line_id' | 'amount' | 'kind'>[]>();
  for (const e of entries ?? []) {
    const bucket = entriesByProject.get(e.project_id) ?? [];
    bucket.push(e);
    entriesByProject.set(e.project_id, bucket);
  }

  return (projects ?? []).map((project) => ({
    project,
    summary: summarizeProject(
      toProjectInput(project),
      (linesByProject.get(project.id) ?? []).map(toLineInput),
      (entriesByProject.get(project.id) ?? []).map((e) =>
        toEntryInput(e as LedgerEntryRow),
      ),
    ),
  }));
}

export async function loadProjectSummary(
  projectId: string,
): Promise<ProjectWithSummary | null> {
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle();

  if (!project) return null;

  const [{ data: lines }, { data: entries }] = await Promise.all([
    supabase.from('budget_lines').select('*').eq('project_id', projectId),
    supabase
      .from('ledger_entries')
      .select('project_id, budget_line_id, amount, kind')
      .eq('project_id', projectId),
  ]);

  return {
    project,
    summary: summarizeProject(
      toProjectInput(project),
      (lines ?? []).map(toLineInput),
      ((entries ?? []) as LedgerEntryRow[]).map(toEntryInput),
    ),
  };
}
```

- [ ] **Step 3: Formulário de projeto**

`components/forms/project-form.tsx` — Client Component, React Hook Form + Zod, no mesmo estilo dos forms podados do Financeme.

Props:

```tsx
type ProjectFormProps = {
  defaultValues?: Partial<ProjectFormValues> & { id?: string };
  onSubmit: (values: ProjectFormValues) => Promise<ActionResult<{ id: string }> | ActionResult>;
  submitLabel: string;
};
```

Campos, na ordem: `code` (Input, com dica "o código do Centro no razão — ex: 30413070101"), `name` (Input), `totalBudget` (Input numérico, exibe `formatBRL` abaixo), `status` (Select com os três valores), `startDate` e `endDate` (Input `type="date"`, lado a lado), `transferLimitPct` (Input numérico, sufixo `%`, default 25, com o texto de ajuda *"Percentual do valor total do projeto que pode ser remanejado entre rubricas"*), `warningThresholdPct` (Input numérico, sufixo `%`, default 80, ajuda *"Avisar quando este percentual do teto for consumido"*), `notes` (Textarea).

Ao submeter, chama `onSubmit` e trata o retorno:

```tsx
const result = await onSubmit(values);
if (!result.ok) {
  toast.error(result.error);
  return;
}
toast.success('Projeto salvo.');
router.push('/');
router.refresh();
```

- [ ] **Step 4: Lista de projetos**

`app/(app)/page.tsx`:

```tsx
import { listProjectsWithSummary } from '@/lib/domain/project-queries';
import { ProjectsView } from './_view';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const projects = await listProjectsWithSummary();
  return <ProjectsView projects={projects} />;
}
```

`app/(app)/_view.tsx` — Client Component. Para cada projeto, um `Card` clicável para `/projetos/{id}` contendo:

- Nome, código do centro e `Badge` de status
- `formatBRL(summary.realized)` de `formatBRL(summary.totalBudget)`
- `Progress` com `value={Math.min(100, (realized / totalBudget) * 100)}`
- Badge de alerta quando `summary.status !== 'ok'`: âmbar com `Remanejamento em {capUsagePct}% do teto` para `'aviso'`, vermelho com `Teto de remanejamento excedido` ou `Orçamento estourado` para `'violacao'` (escolha pela flag `overBudget`)

Estado vazio: texto *"Nenhum projeto cadastrado ainda."* e botão **Novo projeto**. O botão também aparece no topo quando há projetos.

- [ ] **Step 5: Páginas de criar e editar**

`app/(app)/projetos/novo/page.tsx` renderiza `ProjectForm` com `submitLabel="Criar projeto"` e `onSubmit={createProject}`.

`app/(app)/projetos/[id]/editar/page.tsx` é async, recebe `params: Promise<{ id: string }>` (em Next 16 `params` é Promise — faça `await`), busca o projeto e renderiza `ProjectForm` com `defaultValues` preenchidos e `onSubmit` chamando `updateProject(id, values)`. Inclui um botão **Excluir projeto** com `Dialog` de confirmação (nunca `confirm()` nativo — bloqueia a automação do browser) que chama `deleteProject`.

- [ ] **Step 6: Verificar manualmente**

```bash
npm run dev
```

Crie um projeto com código `30413070101`, nome `Estruturante 2026 — Capacitações e Treinamentos`, total `R$ 100.000`, limite 25%, aviso 80%. Esperado: aparece na lista com barra em 0%. Tente criar outro com o mesmo código: erro *"Já existe um projeto com esse código de centro de custo."* Edite o nome e confirme que a lista atualiza.

```bash
npm run build && npm test
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: cadastro e listagem de projetos"
```

---

### Task 8: Gestão de rubricas

**Files:**
- Create: `lib/actions/budget-lines.ts`
- Create: `app/(app)/projetos/[id]/rubricas/page.tsx`, `_view.tsx`

**Interfaces:**
- Consumes: Tasks 2, 3, 7
- Produces:
  - `createBudgetLine(projectId, input): Promise<ActionResult<{ id: string }>>`
  - `updateBudgetLine(id, input): Promise<ActionResult>`
  - `deleteBudgetLine(id): Promise<ActionResult>`
  - `moveBudgetLine(id, parentId: string | null): Promise<ActionResult>`
  - `budgetLineFormSchema`, `type BudgetLineFormValues`

- [ ] **Step 1: Escrever as actions**

`lib/actions/budget-lines.ts`:

```ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ActionResult } from './projects';

export const budgetLineFormSchema = z.object({
  code: z.string().trim().nullable(),
  name: z.string().trim().min(1, 'Informe o nome da rubrica'),
  budgetedAmount: z.number().nonnegative().nullable(),
  parentId: z.string().uuid().nullable(),
  sortOrder: z.number().int().default(0),
});

export type BudgetLineFormValues = z.infer<typeof budgetLineFormSchema>;

export async function createBudgetLine(
  projectId: string,
  input: BudgetLineFormValues,
): Promise<ActionResult<{ id: string }>> {
  const parsed = budgetLineFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('budget_lines')
    .insert({
      project_id: projectId,
      parent_id: parsed.data.parentId,
      code: parsed.data.code === '' ? null : parsed.data.code,
      name: parsed.data.name,
      budgeted_amount:
        parsed.data.budgetedAmount === null ? null : parsed.data.budgetedAmount.toFixed(2),
      sort_order: parsed.data.sortOrder,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'Já existe uma rubrica com esse código neste projeto.' };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/projetos/${projectId}`);
  revalidatePath(`/projetos/${projectId}/rubricas`);
  return { ok: true, data: { id: data.id } };
}

export async function updateBudgetLine(
  id: string,
  input: BudgetLineFormValues,
): Promise<ActionResult> {
  const parsed = budgetLineFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('budget_lines')
    .update({
      parent_id: parsed.data.parentId,
      code: parsed.data.code === '' ? null : parsed.data.code,
      name: parsed.data.name,
      budgeted_amount:
        parsed.data.budgetedAmount === null ? null : parsed.data.budgetedAmount.toFixed(2),
      sort_order: parsed.data.sortOrder,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('project_id')
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/projetos/${data.project_id}`);
  revalidatePath(`/projetos/${data.project_id}/rubricas`);
  return { ok: true, data: undefined };
}

/**
 * Move a rubrica para dentro de um grupo (ou para a raiz).
 * Recusa mover uma rubrica para dentro de si mesma ou de um descendente,
 * o que criaria um ciclo e faria a montagem da árvore perder linhas.
 */
export async function moveBudgetLine(
  id: string,
  parentId: string | null,
): Promise<ActionResult> {
  if (id === parentId) {
    return { ok: false, error: 'Uma rubrica não pode ser filha dela mesma.' };
  }

  const supabase = createAdminClient();
  const { data: line } = await supabase
    .from('budget_lines')
    .select('project_id')
    .eq('id', id)
    .maybeSingle();

  if (!line) return { ok: false, error: 'Rubrica não encontrada.' };

  if (parentId !== null) {
    const { data: all } = await supabase
      .from('budget_lines')
      .select('id, parent_id')
      .eq('project_id', line.project_id);

    const parentOf = new Map((all ?? []).map((l) => [l.id, l.parent_id]));
    let cursor: string | null = parentId;
    while (cursor !== null) {
      if (cursor === id) {
        return { ok: false, error: 'Isso criaria um ciclo entre as rubricas.' };
      }
      cursor = parentOf.get(cursor) ?? null;
    }
  }

  const { error } = await supabase
    .from('budget_lines')
    .update({ parent_id: parentId, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/projetos/${line.project_id}`);
  revalidatePath(`/projetos/${line.project_id}/rubricas`);
  return { ok: true, data: undefined };
}

export async function deleteBudgetLine(id: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { data: line } = await supabase
    .from('budget_lines')
    .select('project_id')
    .eq('id', id)
    .maybeSingle();

  if (!line) return { ok: false, error: 'Rubrica não encontrada.' };

  const { count } = await supabase
    .from('ledger_entries')
    .select('id', { count: 'exact', head: true })
    .eq('budget_line_id', id);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Esta rubrica tem ${count} lançamento(s). Reclassifique-os antes de excluir.`,
    };
  }

  const { error } = await supabase.from('budget_lines').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/projetos/${line.project_id}`);
  revalidatePath(`/projetos/${line.project_id}/rubricas`);
  return { ok: true, data: undefined };
}
```

A guarda contra ciclo importa: `summarizeProject` monta a árvore a partir de `parentId === null`, então um ciclo faria as rubricas envolvidas sumirem silenciosamente do relatório em vez de dar erro.

- [ ] **Step 2: Tela de rubricas**

`app/(app)/projetos/[id]/rubricas/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { loadProjectSummary } from '@/lib/domain/project-queries';
import { BudgetLinesView } from './_view';

export const dynamic = 'force-dynamic';

export default async function BudgetLinesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await loadProjectSummary(id);
  if (!result) notFound();
  return <BudgetLinesView project={result.project} summary={result.summary} />;
}
```

`_view.tsx` — tabela em árvore, uma linha por rubrica, filhas indentadas e colapsáveis. Colunas: Código, Rubrica, Orçado (editável inline), Realizado, Saldo, Ações.

Comportamentos obrigatórios:

- Campo de orçado editável direto na linha; ao sair do campo (`onBlur`), chama `updateBudgetLine`. Enquanto pendente, desabilita o input.
- Rubrica sem orçado exibe `—` e um `Badge` âmbar **sem orçamento**.
- Banner no topo somando o orçado das rubricas de controle contra `project.total_budget`: quando diferem, mostra *"Orçado nas rubricas: {X} de {Y} — faltam {Y − X} a distribuir"* (ou *"excedem em"* quando maior). Não bloqueia nada, é informativo.
- Botão **Nova rubrica** abre `Dialog` com o formulário; o campo Grupo é um `Select` das rubricas existentes mais a opção **(nenhum)**.
- Menu por linha com **Editar**, **Mover para grupo** (`Select` chamando `moveBudgetLine`) e **Excluir** (com `Dialog` de confirmação).

- [ ] **Step 3: Verificar manualmente**

Com o projeto da Task 7, crie as rubricas `31010401001 — Passagens Nacionais` (orçado 45.000), `31010403001 — Hospedagens` (10.000), `31010407001 — Ajuda de Custos` (5.000), `31010409001 — Transportes Urbanos` (2.000). Esperado: banner mostra faltando R$ 38.000 a distribuir.

Crie uma rubrica-grupo `Deslocamento` com orçado 47.000, mova Passagens e Transportes para dentro dela e remova o orçado de ambas. Esperado: o grupo mostra as duas filhas indentadas. Tente mover `Deslocamento` para dentro de `Passagens`: erro *"Isso criaria um ciclo entre as rubricas."*

```bash
npm run build && npm test
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: gestão de rubricas com agrupamento"
```

---

### Task 9: Dashboard do projeto

**Files:**
- Create: `app/(app)/projetos/[id]/page.tsx`, `_view.tsx`
- Create: `components/charts/budget-vs-actual-chart.tsx`
- Create: `components/project/transfer-cap-meter.tsx`
- Create: `components/project/project-alerts.tsx`

**Interfaces:**
- Consumes: `loadProjectSummary` (Task 7), `ProjectSummary`/`LineResult` (Task 3)
- Produces: `TransferCapMeter`, `ProjectAlerts`, `BudgetVsActualChart` (reusados no export e em nada mais)

- [ ] **Step 1: Medidor do teto de remanejamento**

`components/project/transfer-cap-meter.tsx` — Client Component.

```tsx
type TransferCapMeterProps = {
  transferred: number;
  transferCap: number;
  capUsagePct: number;
  warningThresholdPct: number;
  status: 'ok' | 'aviso' | 'violacao';
};
```

Barra horizontal com preenchimento `Math.min(100, capUsagePct)%`, cor verde/âmbar/vermelha conforme `status`. Marcador vertical na posição `warningThresholdPct%`. Abaixo: `{formatBRL(transferred)} remanejados de {formatBRL(transferCap)} permitidos ({capUsagePct}% do teto)`.

- [ ] **Step 2: Faixa de alertas**

`components/project/project-alerts.tsx` recebe `summary: ProjectSummary` e renderiza, na ordem, apenas os que se aplicam:

| Condição | Severidade | Texto |
|---|---|---|
| `overBudget` | vermelho | `Orçamento estourado: realizado de {realized} contra total de {totalBudget}.` |
| `transferred > transferCap` | vermelho | `Teto de remanejamento excedido: {transferred} contra o limite de {transferCap}.` |
| `status === 'aviso'` | âmbar | `Remanejamento em {capUsagePct}% do teto — restam {transferCap − transferred}.` |
| `linesWithoutBudget > 0` | âmbar | `{n} rubrica(s) com gasto e sem orçamento definido. O cálculo do teto está incompleto.` com link para `/projetos/{id}/rubricas` |
| `unclassifiedTotal !== 0` | âmbar | `{formatBRL(unclassifiedTotal)} em lançamentos sem rubrica.` com link para `/projetos/{id}/lancamentos?rubrica=sem` |

Sem nenhuma condição ativa, não renderiza nada.

- [ ] **Step 3: Gráfico orçado × realizado**

`components/charts/budget-vs-actual-chart.tsx` — Recharts `BarChart` com duas séries por rubrica de controle: Orçado e Realizado. Eixo Y formatado com `formatBRL`, tooltip idem. Rubricas sem orçamento entram com barra de Orçado zerada.

- [ ] **Step 4: A página**

`app/(app)/projetos/[id]/page.tsx` — mesmo padrão da Task 8 Step 2, chamando `loadProjectSummary`.

`_view.tsx` monta, de cima para baixo:

1. Cabeçalho: nome, código, `Badge` de status, e links para **Rubricas**, **Lançamentos**, **Importar**, **Editar**, além de um botão **Exportar** (ligado na Task 12).
2. `ProjectAlerts`
3. Quatro `Card` de KPI: **Orçamento total**, **Realizado**, **Saldo disponível** (`available`, em vermelho se negativo), **Consumo do teto** (`capUsagePct` com a cor do status)
4. `TransferCapMeter`
5. Tabela de rubricas em árvore: Código, Rubrica, Orçado, Realizado, Saldo, Excesso, % Execução. A coluna Excesso mostra `—` quando zero e o valor em vermelho quando positivo. Barra fina de execução na célula de %.
6. `BudgetVsActualChart`
7. Quando `writeoffs !== 0`, um `Card` discreto ao pé: *"Baixas de projeto: {formatBRL(writeoffs)} — não entram no realizado nem no cálculo do teto."*

- [ ] **Step 5: Verificar manualmente**

Com o projeto e as rubricas das tasks anteriores e ainda sem lançamentos, esperado: realizado zero, saldo igual ao total, consumo do teto 0%, medidor verde, alerta de rubricas sem orçamento se alguma ficou em branco.

```bash
npm run build && npm test
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: dashboard do projeto com medidor de remanejamento"
```

---

### Task 10: Lançamentos

**Files:**
- Create: `lib/actions/entries.ts`
- Create: `app/(app)/projetos/[id]/lancamentos/page.tsx`, `_view.tsx`
- Create: `components/forms/entry-form.tsx`

**Interfaces:**
- Consumes: Tasks 2, 7, 8
- Produces:
  - `createEntry(projectId, input): Promise<ActionResult<{ id: string }>>`
  - `updateEntry(id, input): Promise<ActionResult>`
  - `deleteEntry(id): Promise<ActionResult>`
  - `reclassifyEntry(id, budgetLineId: string | null): Promise<ActionResult>`
  - `entryFormSchema`, `type EntryFormValues`

- [ ] **Step 1: Escrever as actions**

`lib/actions/entries.ts`. O schema:

```ts
export const entryFormSchema = z.object({
  budgetLineId: z.string().uuid().nullable(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  amount: z.number(),
  description: z.string().trim().nullable(),
  vendorName: z.string().trim().nullable(),
  document: z.string().trim().nullable(),
});

export type EntryFormValues = z.infer<typeof entryFormSchema>;
```

`createEntry` insere com `kind: 'manual'`, `source: 'manual'`, `urls: {}`, `voucher: null`, `journal: null` — assim nunca colide com a unique index do import. `updateEntry` altera apenas os campos do schema, deixando intactos os campos vindos do razão. `deleteEntry` recusa apagar quando `source === 'import'`, com a mensagem *"Lançamentos importados do razão não podem ser excluídos. Reclassifique-o ou ajuste no sistema de origem."* — apagar aqui faria a linha voltar no próximo import, já que a chave de dedupe não existiria mais.

`reclassifyEntry` só troca `budget_line_id` e vale para qualquer origem. Todas revalidam `/projetos/{projectId}` e `/projetos/{projectId}/lancamentos`.

- [ ] **Step 2: A página**

`page.tsx` busca em paralelo: o projeto, as rubricas (para o filtro e o `Select` de reclassificação) e os lançamentos (`select('*')` com `order('entry_date', { ascending: false })`).

`_view.tsx` reaproveita a estrutura de filtros e ordenação de `~/projetos/financeiro/app/(app)/transactions/_view.tsx` — o Financeme continua intacto no disco, então leia o arquivo original de lá. Preste atenção no componente `MultiSelect` definido no topo dele e no par `SortHead`/`SortState`: são os dois padrões a copiar. Filtros:

- Busca livre em descrição, fornecedor, comprovante e documento
- `MultiSelect` de rubrica, com a opção especial **Sem rubrica** (o valor `sem` na query string)
- Intervalo de datas (dois `Input type="date"`)
- `MultiSelect` de tipo: Despesa, Baixa, Manual
- `Select` de origem: Todas, Importadas, Manuais

Colunas ordenáveis: Data, Rubrica, Descrição, Fornecedor, Valor. Barra de resumo acima da tabela com a contagem filtrada e a soma dos valores.

Por linha: `DropdownMenu` com **Reclassificar** (`Select` de rubrica), **Editar** (só habilitado quando `source === 'manual'`), **Excluir** (idem) e, quando houver `urls`, links diretos para Nota fiscal e Comprovante abrindo em nova aba.

Ao montar, se `searchParams.rubrica === 'sem'`, o filtro já vem aplicado — é o link que a Task 9 Step 2 gera.

- [ ] **Step 3: Verificar manualmente**

Crie um lançamento manual de R$ 1.500 na rubrica Hospedagens. Esperado: aparece na lista, o dashboard passa a mostrar realizado de R$ 1.500 e o saldo cai. Reclassifique-o para Passagens e confirme que o dashboard acompanha.

```bash
npm run build && npm test
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: listagem, filtros e edição de lançamentos"
```

---

### Task 11: Importação do razão

**Files:**
- Create: `app/api/import/route.ts`
- Create: `app/api/import/commit/route.ts`
- Create: `app/(app)/projetos/[id]/importar/page.tsx`, `_view.tsx`
- Create: `lib/actions/import.ts`

**Interfaces:**
- Consumes: `readWorkbookRows`/`parseLedgerRows` (Task 5), `resolveImport` (Task 6)
- Produces:
  - `POST /api/import` → `{ plan: ImportPlan, filename: string, discardedRows: number }`
  - `POST /api/import/commit` → `{ inserted, duplicates, unmapped, batchId }`

- [ ] **Step 1: Route Handler de preview**

`app/api/import/route.ts`:

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

  const [{ data: lines }, { data: existing }] = await Promise.all([
    projectIds.length
      ? supabase.from('budget_lines').select('id, code, project_id').in('project_id', projectIds)
      : Promise.resolve({ data: [] as { id: string; code: string | null; project_id: string }[] }),
    projectIds.length
      ? supabase
          .from('ledger_entries')
          .select('project_id, voucher, journal')
          .in('project_id', projectIds)
          .eq('source', 'import')
      : Promise.resolve({ data: [] as { project_id: string; voucher: string | null; journal: string | null }[] }),
  ]);

  const context: ResolutionContext = {
    projectsByCode: Object.fromEntries(
      (projects ?? []).map((p) => [p.code, { id: p.id, name: p.name }]),
    ),
    budgetLinesByProject: {},
    existingKeysByProject: {},
  };

  for (const l of lines ?? []) {
    (context.budgetLinesByProject[l.project_id] ??= []).push({ id: l.id, code: l.code });
  }
  for (const e of existing ?? []) {
    (context.existingKeysByProject[e.project_id] ??= []).push(
      `${e.voucher ?? ''}|${e.journal ?? ''}`,
    );
  }

  return NextResponse.json({
    filename: file.name,
    discardedRows: parsed.discardedRows,
    plan: resolveImport(parsed.entries, context),
  });
}
```

- [ ] **Step 2: Route Handler de commit**

`app/api/import/commit/route.ts` recebe `{ filename: string, plan: ProjectPlan }` — um projeto por chamada, para manter cada gravação pequena. Sequência:

1. Cria as rubricas de `plan.newBudgetLines` com `budgeted_amount: null` e `parent_id: null`, e devolve `id` e `code` de cada.
2. Monta um mapa `code -> id` juntando as recém-criadas às que vieram com `budgetLineId` preenchido.
3. Insere o `import_batches` com os contadores.
4. Insere os `ledger_entries` em lotes de 500 usando `.upsert(..., { onConflict: 'project_id,voucher,journal', ignoreDuplicates: true })` — a unique index parcial cobre exatamente esse par, então uma corrida entre dois imports simultâneos não duplica.
5. Atualiza `rows_inserted` do batch com o número realmente gravado.
6. `revalidatePath` de `/`, `/projetos/{id}`, `/projetos/{id}/lancamentos` e `/projetos/{id}/rubricas`.

Retorna `{ inserted, duplicates, unmapped, batchId }`. Em caso de erro no meio, apaga o batch criado e devolve 500 com a mensagem — os lançamentos já inseridos permanecem, o que é seguro porque o import é idempotente e uma nova tentativa só completa o que falta.

- [ ] **Step 3: Tela de import**

`page.tsx` busca o projeto e o histórico de `import_batches` ordenado por `imported_at desc`, limitado a 20.

`_view.tsx`:

- `Input type="file" accept=".xlsx"` mais uma área de arrastar-e-soltar
- Ao escolher o arquivo, envia para `/api/import` e guarda o plano em estado local
- Renderiza o preview conforme o spec, um bloco por projeto: contagem e soma de novos, duplicados ignorados, baixas, e a lista das rubricas novas com aviso *"serão criadas sem orçamento"*
- Centros desconhecidos aparecem em bloco cinza com o texto *"Nenhum projeto cadastrado com o centro {code} — {n} lançamentos serão ignorados"* e botão **Cadastrar projeto** que leva a `/projetos/novo?code={code}&name={name}`
- Botões **Cancelar** (limpa o estado) e **Confirmar import** (chama `/api/import/commit` para cada projeto do plano, mostra `toast.success` com o total e faz `router.refresh()`)
- Tabela do histórico: data, arquivo, lidas, inseridas, duplicadas, sem rubrica

`app/(app)/projetos/novo/page.tsx` (Task 7) precisa aceitar `searchParams` com `code` e `name` para pré-preencher o formulário. Faça esse ajuste aqui.

- [ ] **Step 4: Verificar com o arquivo real**

Copie `~/Downloads/data.xlsx` para fora do repositório (não commite) e importe pelo projeto `30413070101`.

Esperado no preview: 33 lançamentos novos, 0 duplicados, 1 baixa de R$ −41.156,24, e rubricas novas apenas para as contas que você não cadastrou na Task 8.

Após confirmar, o dashboard deve mostrar realizado de **R$ 48.419,11**, baixas de **R$ −41.156,24** num card separado, e o consumo do teto calculado sobre as rubricas com orçamento.

Importe o mesmo arquivo de novo. Esperado: **33 duplicados, 0 novos** — é a verificação de que a idempotência funciona.

```bash
npm run build && npm test
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: importação do razão com preview e idempotência"
```

---

### Task 12: Exportação

**Files:**
- Create: `app/api/export/route.ts`
- Create: `lib/domain/export-builder.ts`
- Test: `lib/domain/export-builder.test.ts`
- Modify: `app/(app)/projetos/[id]/_view.tsx` (liga o botão Exportar)

**Interfaces:**
- Consumes: `ProjectSummary`/`LineResult` (Task 3), `loadProjectSummary` (Task 7)
- Produces:
  - `buildSummarySheet(project: ProjectRow, summary: ProjectSummary): (string | number)[][]`
  - `buildIndicatorsSheet(project: ProjectRow, summary: ProjectSummary): (string | number)[][]`
  - `buildEntriesSheet(entries: LedgerEntryRow[], lineNames: Map<string, string>): (string | number)[][]`

- [ ] **Step 1: Escrever o teste que falha**

`lib/domain/export-builder.test.ts`. O `summary` é construído na mão para o teste falhar por um motivo só — não chame `summarizeProject` aqui.

```ts
import { describe, it, expect } from 'vitest';
import { buildSummarySheet, buildIndicatorsSheet, buildEntriesSheet } from './export-builder';
import type { ProjectSummary, LineResult } from './budget';
import type { ProjectRow, LedgerEntryRow } from '@/lib/supabase/types';

function line(over: Partial<LineResult>): LineResult {
  return {
    id: 'l1',
    code: '31010401001',
    name: 'Passagens Nacionais',
    budgeted: 45000,
    realized: 40959.65,
    balance: 4040.35,
    excess: 0,
    executionPct: 91.02,
    isControl: true,
    children: [],
    ...over,
  };
}

const project = {
  id: 'p1',
  code: '30413070101',
  name: 'Estruturante 2026',
  total_budget: '100000.00',
} as ProjectRow;

const summary: ProjectSummary = {
  totalBudget: 100000,
  realized: 48419.11,
  available: 51580.89,
  transferred: 2000,
  transferCap: 25000,
  capUsagePct: 8,
  writeoffs: -41156.24,
  unclassifiedTotal: 0,
  linesWithoutBudget: 1,
  overBudget: false,
  status: 'ok',
  lines: [line({})],
};

describe('buildSummarySheet', () => {
  it('começa pelo cabeçalho esperado', () => {
    const sheet = buildSummarySheet(project, summary);
    expect(sheet[0]).toEqual([
      'Código', 'Rubrica', 'Orçado', 'Realizado', 'Saldo', 'Excesso', '% Execução',
    ]);
  });

  it('escreve a rubrica com valores numéricos, não formatados', () => {
    const sheet = buildSummarySheet(project, summary);
    expect(sheet[1]).toEqual([
      '31010401001', 'Passagens Nacionais', 45000, 40959.65, 4040.35, 0, 91.02,
    ]);
  });

  it('indenta a filha e a coloca logo depois do pai', () => {
    const comFilha: ProjectSummary = {
      ...summary,
      lines: [
        line({
          id: 'pai',
          code: null,
          name: 'Deslocamento',
          children: [line({ id: 'f1', name: 'Passagens Nacionais', budgeted: null, balance: null, executionPct: null, isControl: false })],
        }),
      ],
    };
    const sheet = buildSummarySheet(project, comFilha);
    expect(sheet[1][1]).toBe('Deslocamento');
    expect(sheet[2][1]).toBe('  Passagens Nacionais');
  });

  it('deixa vazio, e não zero, o que não tem orçamento', () => {
    const semOrcamento: ProjectSummary = {
      ...summary,
      lines: [line({ budgeted: null, balance: null, executionPct: null, isControl: false })],
    };
    const sheet = buildSummarySheet(project, semOrcamento);
    expect(sheet[1][2]).toBe('');
    expect(sheet[1][4]).toBe('');
    expect(sheet[1][6]).toBe('');
  });

  it('fecha com a linha de total', () => {
    const sheet = buildSummarySheet(project, summary);
    expect(sheet[sheet.length - 1]).toEqual(['', 'TOTAL', 100000, 48419.11, 51580.89, 2000, '']);
  });
});

describe('buildIndicatorsSheet', () => {
  it('traz os indicadores com rótulo e valor', () => {
    const sheet = buildIndicatorsSheet(project, summary);
    expect(sheet[0]).toEqual(['Indicador', 'Valor']);
    expect(sheet).toContainEqual(['Orçamento total', 100000]);
    expect(sheet).toContainEqual(['Realizado', 48419.11]);
    expect(sheet).toContainEqual(['Saldo disponível', 51580.89]);
    expect(sheet).toContainEqual(['Remanejado entre rubricas', 2000]);
    expect(sheet).toContainEqual(['Teto de remanejamento', 25000]);
    expect(sheet).toContainEqual(['Consumo do teto (%)', 8]);
    expect(sheet).toContainEqual(['Baixas de projeto', -41156.24]);
  });
});

describe('buildEntriesSheet', () => {
  const entry = {
    entry_date: '2026-04-30',
    budget_line_id: 'l1',
    account_code: '31010401001',
    account_name: 'Passagens Nacionais',
    description: 'Compra referente NF 000000',
    vendor_name: 'FORNECEDOR EXEMPLO LTDA',
    vendor_doc: '00.000.000/0001-00',
    amount: '7795.41',
    kind: 'despesa',
    source: 'import',
    voucher: 'CONTAB000197595',
    journal: '2-02104071',
    urls: { nota_fiscal: null, comprovante: 'https://exemplo.invalid/c' },
  } as LedgerEntryRow;

  it('resolve o nome da rubrica pelo mapa', () => {
    const sheet = buildEntriesSheet([entry], new Map([['l1', 'Passagens Nacionais']]));
    expect(sheet[1][1]).toBe('Passagens Nacionais');
    expect(sheet[1][6]).toBe(7795.41);
  });

  it('escreve "Sem rubrica" quando não há classificação', () => {
    const sheet = buildEntriesSheet(
      [{ ...entry, budget_line_id: null }],
      new Map(),
    );
    expect(sheet[1][1]).toBe('Sem rubrica');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm test -- lib/domain/export-builder.test.ts
```

Esperado: FAIL — `Failed to resolve import "./export-builder"`.

- [ ] **Step 3: Implementar `lib/domain/export-builder.ts`**

Puras, sem ExcelJS. Valores monetários saem como `number`, não string formatada, para o Excel tratá-los como número — a formatação `R$ #,##0.00` é aplicada no Route Handler.

```ts
import type { ProjectSummary, LineResult } from './budget';
import type { ProjectRow, LedgerEntryRow } from '@/lib/supabase/types';

export type SheetCell = string | number;
export type Sheet = SheetCell[][];

const KIND_LABEL: Record<string, string> = {
  despesa: 'Despesa',
  baixa: 'Baixa de projeto',
  manual: 'Manual',
};

export function buildSummarySheet(_project: ProjectRow, summary: ProjectSummary): Sheet {
  const rows: Sheet = [
    ['Código', 'Rubrica', 'Orçado', 'Realizado', 'Saldo', 'Excesso', '% Execução'],
  ];

  function walk(line: LineResult, depth: number): void {
    rows.push([
      line.code ?? '',
      `${'  '.repeat(depth)}${line.name}`,
      line.budgeted ?? '',
      line.realized,
      line.balance ?? '',
      line.excess,
      line.executionPct ?? '',
    ]);
    for (const child of line.children) walk(child, depth + 1);
  }

  for (const line of summary.lines) walk(line, 0);

  if (summary.unclassifiedTotal !== 0) {
    rows.push(['', 'Sem rubrica', '', summary.unclassifiedTotal, '', 0, '']);
  }

  rows.push([
    '',
    'TOTAL',
    summary.totalBudget,
    summary.realized,
    summary.available,
    summary.transferred,
    '',
  ]);

  return rows;
}

export function buildIndicatorsSheet(project: ProjectRow, summary: ProjectSummary): Sheet {
  return [
    ['Indicador', 'Valor'],
    ['Projeto', project.name],
    ['Centro de custo', project.code],
    ['Orçamento total', summary.totalBudget],
    ['Realizado', summary.realized],
    ['Saldo disponível', summary.available],
    ['Remanejado entre rubricas', summary.transferred],
    ['Teto de remanejamento', summary.transferCap],
    ['Consumo do teto (%)', summary.capUsagePct],
    ['Baixas de projeto', summary.writeoffs],
    ['Rubricas sem orçamento', summary.linesWithoutBudget],
  ];
}

export function buildEntriesSheet(
  entries: LedgerEntryRow[],
  lineNames: Map<string, string>,
): Sheet {
  const rows: Sheet = [
    [
      'Data', 'Rubrica', 'Conta', 'Descrição', 'Fornecedor', 'CNPJ/CPF', 'Valor',
      'Tipo', 'Origem', 'Comprovante', 'Diário', 'Nota fiscal', 'URL comprovante',
    ],
  ];

  for (const e of entries) {
    rows.push([
      e.entry_date,
      e.budget_line_id === null
        ? 'Sem rubrica'
        : lineNames.get(e.budget_line_id) ?? 'Sem rubrica',
      e.account_code ? `${e.account_code} - ${e.account_name ?? ''}`.trim() : '',
      e.description ?? '',
      e.vendor_name ?? '',
      e.vendor_doc ?? '',
      Number(e.amount),
      KIND_LABEL[e.kind] ?? e.kind,
      e.source === 'import' ? 'Importado' : 'Manual',
      e.voucher ?? '',
      e.journal ?? '',
      e.urls?.nota_fiscal ?? '',
      e.urls?.comprovante ?? '',
    ]);
  }

  return rows;
}
```

- [ ] **Step 4: Rodar até passar**

```bash
npm test -- lib/domain/export-builder.test.ts
```

Esperado: PASS, 8 testes.

- [ ] **Step 5: Route Handler**

`app/api/export/route.ts`, `runtime = 'nodejs'`. Lê `projeto` e `formato` da query string, chama `loadProjectSummary` e busca os lançamentos. Para `formato=xlsx`, monta as três abas com ExcelJS, aplica negrito no cabeçalho, `numFmt` de moeda nas colunas de valor e largura automática, e devolve com:

```ts
headers: {
  'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'Content-Disposition': `attachment; filename="farol-${project.code}-${hoje}.xlsx"`,
}
```

Para `formato=csv`, serializa apenas `buildSummarySheet` com separador `;` (padrão do Excel pt-BR), prefixo BOM `﻿` para o acento não quebrar, e `Content-Type: text/csv; charset=utf-8`.

- [ ] **Step 6: Ligar o botão**

No `_view.tsx` do dashboard, o botão **Exportar** vira um `DropdownMenu` com **Excel (.xlsx)** e **CSV**, cada item um `<a href={/api/export?projeto=${id}&formato=xlsx} download>`.

- [ ] **Step 7: Verificar manualmente**

Exporte o projeto com os dados importados na Task 11. Abra o arquivo. Esperado: aba Resumo com as rubricas e o realizado batendo com o dashboard, aba Lançamentos com 33 linhas mais a baixa, aba Indicadores com remanejado e consumo do teto.

```bash
npm run build && npm test
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: exportação em xlsx e csv"
```

---

### Task 13: Configurações e deploy

**Files:**
- Create: `app/(app)/configuracoes/page.tsx`, `_view.tsx`
- Create: `lib/actions/settings.ts`
- Create: `supabase/migrations/0002_app_settings.sql`
- Modify: `components/forms/project-form.tsx` (usa os padrões)
- Modify: `README.md`

**Interfaces:**
- Consumes: Tasks 2, 7
- Produces:
  - `loadSettings(): Promise<{ defaultTransferLimitPct: number; defaultWarningThresholdPct: number }>`
  - `updateSettings(input): Promise<ActionResult>`

- [ ] **Step 1: Migration da tabela de configurações**

`supabase/migrations/0002_app_settings.sql`:

```sql
create table app_settings (
  id boolean primary key default true check (id),
  default_transfer_limit_pct numeric(5,2) not null default 25
    check (default_transfer_limit_pct >= 0 and default_transfer_limit_pct <= 100),
  default_warning_threshold_pct numeric(5,2) not null default 80
    check (default_warning_threshold_pct >= 0 and default_warning_threshold_pct <= 100),
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

insert into app_settings (id) values (true) on conflict do nothing;

notify pgrst, 'reload schema';
```

A chave primária booleana com `check (id)` garante linha única — só o valor `true` é aceito.

Aplique via MCP Supabase com nome `0002_app_settings` e acrescente `app_settings` a `Database` em `lib/supabase/types.ts`.

- [ ] **Step 2: Actions e tela**

`lib/actions/settings.ts` com `loadSettings` (lê a linha única, devolve os defaults do código se a tabela estiver vazia) e `updateSettings` (valida com Zod entre 0 e 100, faz `update` em `id = true`, revalida `/configuracoes` e `/projetos/novo`).

`app/(app)/configuracoes/page.tsx` renderiza um formulário com os dois campos percentuais e o texto explicativo: *"Valores aplicados a projetos novos. Projetos já criados mantêm os limites definidos individualmente."*

`components/forms/project-form.tsx` passa a receber `defaults` e usá-los quando `defaultValues` não traz `transferLimitPct` nem `warningThresholdPct`. A página `/projetos/novo` busca via `loadSettings` e repassa.

- [ ] **Step 3: README**

Reescreva `README.md` com: o que o aplicativo faz, a regra do teto de remanejamento em três linhas, as quatro variáveis de ambiente, como rodar local, como aplicar migration, e a nota de que o acesso ao banco é sempre server-side.

- [ ] **Step 4: Deploy na Vercel**

```bash
cd ~/projetos/farol-projetos
git config user.email socialinformes@gmail.com
npx vercel@latest link
npx vercel@latest env add SUPABASE_URL production
npx vercel@latest env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel@latest env add APP_PASSWORD production
npx vercel@latest env add SESSION_SECRET production
npx vercel@latest --prod
```

O `git config user.email` não é opcional: com um email fora da conta Vercel do usuário, os deploys saem como `BLOCKED`.

Repita os quatro `env add` para `preview` — sem isso as branches de preview quebram na primeira query.

- [ ] **Step 5: Verificar em produção**

Abra a URL. Esperado: pede a senha, entra, lista os projetos com os dados reais, o import funciona e o export baixa o arquivo. Confirme no DevTools que nenhuma resposta contém `SUPABASE_SERVICE_ROLE_KEY` nem a string `service_role`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: configurações padrão e preparação de deploy"
```

---

## Auto-revisão

**Cobertura do spec:**

| Seção do spec | Task |
|---|---|
| 2. Regra dos 25%, nível de controle, rubrica sem orçamento | 3 |
| 2. Baixa de projeto | 3 (cálculo), 5 (classificação) |
| 3. Modelo de dados | 2, 13 (`app_settings`) |
| 4. Parser e regras de descarte | 5 |
| 4. Dedupe e preview em duas etapas | 6, 11 |
| 5. Exportação em três abas | 12 |
| 6. Telas | 7 (lista, novo, editar), 8 (rubricas), 9 (dashboard), 10 (lançamentos), 11 (importar), 13 (configurações) |
| 7. Senha única e service role | 4, 2 |
| 8. Fork e poda | 1 |
| 9. Testes | 3, 4, 5, 6, 12 |
| 10. Stack | 1 |

**Consistência de tipos:** `ActionResult<T>` é definido em `lib/actions/projects.ts` (Task 7) e importado por Tasks 8, 10 e 13. `ParsedEntry` sai da Task 5 e é consumido pela 6. `ProjectSummary` e `LineResult` saem da Task 3 e são consumidos por 7, 9 e 12. `EntryUrls` sai da Task 2 e é consumido pela 5. `EntryKind` aparece nas Tasks 2 e 3 — são declarações independentes com os mesmos três valores, o que é intencional para manter `lib/domain/budget.ts` livre de dependência do schema.

**Ordem e paralelismo:** a Task 1 é pré-requisito de tudo. As Tasks 3, 4 e 5 são independentes entre si e podem correr em paralelo depois da 1 (a 3 precisa dos tipos da 2 apenas no Step 5). A 6 depende da 5. As Tasks 7 a 13 são sequenciais.

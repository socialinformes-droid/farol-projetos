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

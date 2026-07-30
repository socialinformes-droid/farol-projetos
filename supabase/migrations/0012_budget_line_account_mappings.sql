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

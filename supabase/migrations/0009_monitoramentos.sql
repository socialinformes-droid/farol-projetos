-- Farol de Projetos — monitoramentos periódicos (2026-07-28)
--
-- O monitoramento é entregue num formulário do PMO DR/AL com seis campos de
-- texto. Esta tabela guarda o que foi gerado e, principalmente, o que foi
-- efetivamente enviado depois da revisão do gestor — a versão editada é a que
-- vira histórico, não a que a IA produziu.
--
-- Os campos espelham o formulário na ordem em que ele pergunta, para copiar e
-- colar sem procurar.

create table monitorings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,

  -- Intervalo considerado na coleta. O formulário pede o mês de referência,
  -- mas o período é livre: há projetos quinzenais.
  period_start date not null,
  period_end date not null,
  reference_label text,

  -- Campos 5 a 9 do formulário do PMO.
  desempenho_fisico text,
  resultados text,
  desempenho_financeiro text,
  riscos text,
  conclusao text,

  -- Insumo bruto que alimentou a geração, guardado para auditoria: permite
  -- entender depois por que o texto disse o que disse.
  snapshot jsonb,

  generated_at timestamptz,
  generated_model text,
  -- Marcado quando o gestor confirma que enviou ao PMO.
  submitted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index monitorings_project_idx on monitorings (project_id, period_end desc);

alter table monitorings enable row level security;

notify pgrst, 'reload schema';

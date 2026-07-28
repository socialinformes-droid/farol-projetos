-- Farol de Projetos — barreira de análise do monitoramento (2026-07-28)
--
-- Antes de redigir o monitoramento, a IA analisa o período e levanta o que não
-- consegue responder sozinha: atrasos sem justificativa, riscos aparentes,
-- entregas concluídas sem descrição de benefício.
--
-- Cada apontamento tem três saídas possíveis, porque nem todo alerta é um
-- problema real:
--
--   justificado  — o gestor explica; o texto entra no monitoramento
--   replanejado  — não é atraso, a data mudou no planejamento. O Farol NÃO
--                  altera a data prevista: ela pertence ao SGF, que é onde o
--                  replanejamento é formalizado. Aqui só se registra que
--                  aquele desvio é conhecido e legítimo.
--   dispensado   — irrelevante para este monitoramento
--
-- A marcação PERSISTE entre períodos. Sem isso, o mesmo atraso reapareceria a
-- cada análise e o gestor teria de dispensá-lo todo mês, para sempre. A
-- persistência é invalidada quando a data prevista muda no SGF — aí o desvio é
-- outro e merece nova avaliação.

create table activity_findings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  activity_id uuid not null references activities (id) on delete cascade,

  kind text not null
    check (kind in ('atraso', 'sem_justificativa', 'risco', 'beneficio', 'outro')),

  resolution text not null
    check (resolution in ('pendente', 'justificado', 'replanejado', 'dispensado')),

  -- Texto do gestor, aproveitado na geração do monitoramento.
  note text,

  -- Datas previstas vigentes quando a marcação foi feita. Se o SGF mudar o
  -- planejamento, a marcação deixa de valer e o apontamento volta a aparecer.
  planned_start_at_resolution date,
  planned_end_at_resolution date,

  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (activity_id, kind)
);
create index activity_findings_project_idx on activity_findings (project_id, resolution);

alter table activity_findings enable row level security;

notify pgrst, 'reload schema';

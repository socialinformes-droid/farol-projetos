-- Farol de Projetos — acompanhamento físico (2026-07-28)
--
-- Estrutura do cronograma físico exportado do SGF: Entrega → Atividade, com
-- comentários datados por atividade.
--
-- A chave de idempotência do import é o hash de `entrega + atividade`,
-- verificada contra o arquivo real: as 30 linhas geram 30 chaves distintas,
-- enquanto o nome da atividade sozinho colide em dois casos ("Planejar
-- participação e definir representantes do DR" aparece em duas entregas).
--
-- As datas NÃO entram na chave de propósito. Um replanejamento no SGF muda a
-- data prevista, e se ela compusesse a chave, a atividade replanejada entraria
-- como nova — perdendo o vínculo com os comentários e as datas reais já
-- registradas, que é exatamente o que este módulo existe para preservar.

create table deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  -- Marcada quando some do SGF: registro com histórico nunca é apagado por import.
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name)
);
create index deliverables_project_idx on deliverables (project_id, sort_order);

create table activities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  deliverable_id uuid not null references deliverables (id) on delete cascade,
  name text not null,
  responsible text,

  -- Previstas: vêm do SGF e são substituídas a cada import (replanejamento).
  planned_start date,
  planned_end date,

  -- Reais: podem ser registradas no Farol antes de existirem no SGF. É delas
  -- que sai a fila de pendências de lançamento.
  actual_start date,
  actual_end date,

  -- O que o SGF diz que são as datas reais, guardado à parte para a
  -- conciliação saber o que já foi lançado lá.
  sgf_actual_start date,
  sgf_actual_end date,
  sgf_status text,
  sgf_updated_at date,

  -- Derivado das datas reais do Farol, não copiado do SGF: lá "Em andamento"
  -- significa apenas "não concluído", inclusive para o que nem começou.
  status text not null default 'nao_iniciado'
    check (status in ('nao_iniciado', 'em_andamento', 'concluido')),

  sort_order integer not null default 0,
  import_key text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, import_key)
);
create index activities_project_idx on activities (project_id, sort_order);
create index activities_deliverable_idx on activities (deliverable_id);
create index activities_status_idx on activities (project_id, status);

create table activity_comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities (id) on delete cascade,
  -- Sem contas de usuário: o autor é escolhido entre os responsáveis que
  -- vieram do SGF, ou digitado.
  author text,
  body text not null,
  -- Data do fato comentado, que pode ser anterior ao registro.
  happened_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index activity_comments_activity_idx on activity_comments (activity_id, happened_on desc);

alter table deliverables      enable row level security;
alter table activities        enable row level security;
alter table activity_comments enable row level security;

notify pgrst, 'reload schema';

-- Farol de Projetos — identificação para o monitoramento (2026-07-28)
--
-- O formulário de monitoramento do PMO DR/AL exige três dados que o cadastro
-- não guardava:
--
--   sgf_number   — "Nome ou Nº do Projeto no SGF" (ex.: 340252). É também a
--                  chave que liga o projeto ao cronograma físico exportado do
--                  SGF; o razão contábil identifica o mesmo projeto pelo
--                  centro de custo, que é outro código.
--   entity       — "O projeto pertence à: SESI ou SENAI"
--   manager_name — "Nome do gestor"
--
-- Todos opcionais: projetos já cadastrados seguem válidos, e o monitoramento
-- avisa quando faltarem em vez de impedir o cadastro.

alter table projects add column if not exists sgf_number text;
alter table projects add column if not exists manager_name text;
alter table projects add column if not exists entity text;

alter table projects drop constraint if exists projects_entity_check;

alter table projects
  add constraint projects_entity_check
  check (entity is null or entity in ('SESI', 'SENAI'));

create index if not exists projects_sgf_number_idx on projects (sgf_number);

notify pgrst, 'reload schema';

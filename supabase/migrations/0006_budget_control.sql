-- Farol de Projetos — modo de controle do orçamento (2026-07-28)
--
-- Nem todo projeto trava valor por rubrica. Em alguns, as rubricas apenas
-- classificam o gasto e o limite é o total do projeto — as rubricas são
-- consumíveis do projeto como um todo, sem teto individual.
--
-- Nesses casos o teto de remanejamento não existe (não há valor de rubrica
-- para estourar) e o aviso de "rubrica sem orçamento definido" é ruído: o
-- campo está vazio de propósito, não por falta de preenchimento.
--
--   por_rubrica — cada rubrica tem valor orçado e vale o teto de remanejamento
--   global      — o limite é o total do projeto; rubricas só classificam
--
-- O padrão é 'por_rubrica', que preserva o comportamento dos projetos já
-- cadastrados e é o mais restritivo: se o projeto for global, trocar não perde
-- nada; o inverso esconderia um controle que deveria existir.

alter table projects
  add column if not exists budget_control text not null default 'por_rubrica';

alter table projects
  drop constraint if exists projects_budget_control_check;

alter table projects
  add constraint projects_budget_control_check
  check (budget_control in ('por_rubrica', 'global'));

notify pgrst, 'reload schema';

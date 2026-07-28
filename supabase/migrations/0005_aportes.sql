-- Farol de Projetos — modalidade de financiamento e aportes (2026-07-28)
--
-- A linha de conta 4xxx que o razão traz não é dedução de despesa: é o valor
-- aportado no projeto, e o comprovante dela é literalmente RECEITAS000047236.
-- Chamá-la de "baixa" foi erro de leitura na modelagem inicial.
--
-- Como esse valor deve ser lido depende do projeto. São três modalidades:
--
--   adiantamento — o recurso entra no caixa antes; interessa o saldo
--                  disponível (recebido menos gasto)
--   reembolso    — gasta-se primeiro e o valor volta após prestação de
--                  contas; interessa o quanto ainda há a ressarcir
--   interno      — sai do orçamento próprio, sem aporte externo; não há
--                  pergunta de caixa a responder
--
-- No projeto de referência, gasto R$ 48.419,11 menos recebido R$ 41.156,24
-- dá R$ 7.262,87 — exatamente o "Total" do rodapé da planilha do Genus.

alter table projects
  add column if not exists funding_model text not null default 'interno';

alter table projects
  drop constraint if exists projects_funding_model_check;

alter table projects
  add constraint projects_funding_model_check
  check (funding_model in ('adiantamento', 'reembolso', 'interno'));

-- 'baixa' vira 'aporte'; 'ignorado' passa a existir para o lançamento que o
-- usuário quer fora de qualquer cálculo sem precisar excluí-lo.
alter table ledger_entries drop constraint if exists ledger_entries_kind_check;

update ledger_entries set kind = 'aporte' where kind = 'baixa';

alter table ledger_entries
  add constraint ledger_entries_kind_check
  check (kind in ('despesa', 'aporte', 'manual', 'ignorado'));

notify pgrst, 'reload schema';

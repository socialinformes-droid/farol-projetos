-- Farol de Projetos — chave de idempotência do import (2026-07-27)
--
-- O par Comprovante+Diário NÃO identifica um lançamento do razão. Um mesmo
-- documento cobre várias linhas: o CONTAB000200813 do arquivo real tem 9
-- linhas, duas delas com a mesma conta e o mesmo valor (R$ 7.795,41 em
-- Passagens), distinguidas apenas pela Descrição — NF 180785 contra NF 180789.
-- São lançamentos legítimos e distintos.
--
-- Com a chave antiga o import descartava 9 das 33 linhas como duplicadas,
-- perdendo R$ 12.861,41 em silêncio. A chave passa a ser o hash SHA-256 de
-- voucher, diário, conta, valor, data e descrição, calculado na aplicação e
-- gravado em import_key. Hash em vez da concatenação literal porque as
-- descrições passam de 200 caracteres e um índice btree tem limite de 2704
-- bytes por entrada.

alter table ledger_entries add column if not exists import_key text;

-- O índice antigo tratava linhas distintas como a mesma.
drop index if exists ledger_entries_import_key;

create unique index if not exists ledger_entries_import_key_idx
  on ledger_entries (project_id, import_key)
  where source = 'import';

notify pgrst, 'reload schema';

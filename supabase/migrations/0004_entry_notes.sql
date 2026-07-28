-- Farol de Projetos — anotação livre no lançamento (2026-07-27)
--
-- O razão do Genus traz o link do comprovante bancário em 22 de 33 linhas, mas
-- o da nota fiscal em apenas 2. Quando a nota existe fora do sistema, o usuário
-- precisa colar a URL à mão — e precisa também de um espaço para justificar um
-- gasto ou marcar uma pendência que a contabilidade não registra.
--
-- Editar esses campos é seguro em relação ao import: `import_key` é gravado uma
-- única vez, no commit, e nunca recalculado. A verificação de duplicata compara
-- a chave calculada a partir do ARQUIVO com a chave GRAVADA na linha, então
-- alterar urls ou notes não faz o próximo import reinserir nada. E como o
-- import ignora linhas já existentes em vez de sobrescrevê-las, o que for
-- editado aqui sobrevive aos reimports.

alter table ledger_entries add column if not exists notes text;

notify pgrst, 'reload schema';

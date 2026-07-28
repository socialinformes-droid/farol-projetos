-- Farol de Projetos — documento do projeto como contexto da IA (2026-07-28)
--
-- Ao gerar o monitoramento, a IA conhece a execução (o que foi gasto, o que
-- foi concluído) mas não conhece o projeto: qual o objetivo, o que está no
-- escopo, o que foi prometido. Sem isso, o campo "Objetivo" do formulário do
-- PMO sai genérico — exatamente o que o manual proíbe.
--
-- Guarda-se o TEXTO extraído do PDF, não o arquivo. É o texto que alimenta o
-- prompt, e mantê-lo editável permite ao gestor corrigir o que a extração
-- trouxe torto ou acrescentar o que o documento não diz.
--
-- No relatório do SGF de referência, as seções úteis (JUSTIFICATIVA até DADOS
-- COMPLEMENTARES) somam 3.913 caracteres de 22.306: o resto é equipe,
-- histórico e anexos, que não ajudam a redigir e só encarecem cada chamada.

alter table projects add column if not exists context_document text;
alter table projects add column if not exists context_document_name text;
alter table projects add column if not exists context_updated_at timestamptz;

notify pgrst, 'reload schema';

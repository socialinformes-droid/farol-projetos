# Farol de Projetos

Farol de Projetos acompanha as duas execuções de um projeto institucional do SESI-AL — a **financeira** e a **física** — e reúne o que aconteceu em cada período para redigir o monitoramento mensal exigido pelo PMO.

Os dados vivem em dois sistemas de origem: o razão contábil do Genus e o cronograma do SGF. O aplicativo importa ambos, deixa registrar o andamento no dia em que acontece, e ao fim do período junta tudo — atividades concluídas, atrasos em dias, lançamentos, comentários — para gerar o texto do monitoramento. O próprio SGF mede a lacuna que isso resolve: *"Quantidade de dias sem Monitoramento DR: 28"*.

O uso é interno: acesso por senha única, sem cadastro de usuários.

## Módulos

| Rota | O que faz |
|---|---|
| `/projetos/[id]/financeiro` | Orçamento por rubrica, import do razão, teto de remanejamento, aportes recebidos |
| `/projetos/[id]/fisico` | Entregas e atividades do SGF, comentários, fila de pendências de lançamento |
| `/projetos/[id]/monitoramento` | Coleta por período, barreira de análise, geração assistida por IA |
| Chat flutuante | Dúvidas sobre o projeto, disponível em toda tela interna |

Este projeto nasceu como fork podado do Financeme (controle financeiro pessoal), reaproveitando a base técnica — Next.js, Supabase, componentes de UI — e removendo todo o domínio de finanças pessoais que não se aplicava a orçamento institucional.

## A regra do teto de remanejamento

Aplica-se apenas a projetos configurados como **controle por rubrica**. Há projetos em que as rubricas só classificam o gasto e o limite é o total — nesses (`budget_control = 'global'`) não existe remanejamento a medir, e o limiar de aviso passa a incidir sobre a execução do orçamento.

O valor total de um projeto é fixo e dividido entre as rubricas. Gastar menos do que o orçado numa rubrica é livre — a economia não gera crédito em lugar nenhum. Gastar mais do que o orçado numa rubrica é um excesso, e a soma de todos os excessos do projeto (nunca a diferença entre excessos e economias) fica limitada a um percentual configurável do valor total do projeto, por padrão 25%. Em outras palavras, uma rubrica que economizou não compensa outra que estourou: o teto incide sobre a soma bruta dos estouros, não sobre o saldo líquido do projeto.

## Stack

- Next.js 16 (App Router, build com Webpack)
- Supabase — apenas `@supabase/supabase-js` com service role; não há `@supabase/ssr` nem login de usuário, porque o controle de acesso é uma senha única de aplicativo, não uma conta por pessoa
- Tailwind CSS + componentes shadcn/ui
- Zod + React Hook Form nos formulários
- SheetJS e ExcelJS, cada um cobrindo a metade que o outro não cobre (ver abaixo)

## Leitura e escrita de planilhas: por que duas bibliotecas

O aplicativo usa duas bibliotecas de planilha para dois sentidos diferentes, e não é redundância — cada uma resolve um problema que a outra não resolve:

- **Leitura do razão (arquivo `.xlsx` exportado do sistema contábil) usa SheetJS**, vendorizado em `vendor/xlsx-0.20.3.tgz` e instalado como dependência local (`file:vendor/...`) em vez de vir do npm. O sistema contábil grava o XML interno do arquivo com um prefixo de namespace na tag de célula que é XML válido, mas o ExcelJS não abre essa variante — falha com "Cannot read properties of undefined (reading 'sheets')". O SheetJS lê o arquivo real sem ajuste nenhum.
- **Escrita do export (planilha de acompanhamento em três abas) usa ExcelJS.** O SheetJS só formata células — moeda, cor condicional, negrito — na edição paga (Pro); a edição gratuita não tem essa API. O ExcelJS formata células de graça, então é ele quem gera o arquivo que o usuário baixa.

Nenhuma das duas faz o papel da outra no código: o SheetJS nunca escreve arquivo, o ExcelJS nunca lê o razão importado.

## Idempotência do import

Reimportar o mesmo arquivo do razão não duplica lançamentos. Cada linha recebe uma `import_key` — hash SHA-256 de voucher, diário, conta, valor, data e descrição — e um índice único em `(project_id, import_key)` no banco garante que a mesma linha nunca entra duas vezes. O par Comprovante+Diário sozinho não bastava como chave: um mesmo documento contábil pode cobrir várias linhas do razão com a mesma conta e o mesmo valor, distinguidas só pela descrição — por exemplo, duas notas fiscais diferentes lançadas no mesmo comprovante — e usar só o par tratava essas linhas, incorretamente, como duplicatas.

## Aportes recebidos

Contas do grupo `4` com valor negativo no razão **não são dedução de despesa**: são o valor aportado no projeto. O crédito contábil explica o sinal. Elas entram como `kind = 'aporte'`, ficam fora do realizado e não criam rubrica.

Como ler o aporte depende de `funding_model`: em `adiantamento` o recurso entra antes e interessa o saldo em caixa; em `reembolso` gasta-se primeiro e interessa quanto há a ressarcir; em `interno` não há aporte externo e o bloco de caixa nem aparece.

## Acompanhamento físico

O cronograma vem do `.xls` do SGF — que apesar da extensão é SpreadsheetML 2003. Duas armadilhas do formato, ambas tratadas: o prólogo declara `ISO-8859-1` mas o parser assume UTF-8 (é preciso decodificar antes), e a coluna `Entrega` só é preenchida na primeira linha de cada grupo (exige *forward fill*, senão dois terços das atividades ficam órfãs).

Cada atividade guarda quatro datas: início e fim, previsto e real. O status é **derivado das datas do Farol**, nunca copiado do SGF — lá "Em andamento" significa apenas "não concluído", inclusive para atividades que só começam meses depois.

Reimportar é conciliação: datas previstas são substituídas (replanejamento é legítimo), mas **datas reais e comentários registrados aqui nunca são sobrescritos**. O que diverge entre os dois sistemas vira a fila de pendências de lançamento no SGF, que é manual — não há API.

O percentual de progresso vem da contagem de atividades concluídas, não da coluna `% de Realização` do SGF, que só assume 0 ou 100.

## Monitoramento

Duas camadas independentes. A **coleta** monta o registro factual do período e funciona sem IA nenhuma — é ela que produz frases como "concluída em 14/04, com 14 dias de atraso frente ao planejado". A **geração** redige os cinco campos do formulário do PMO chamando o DeepSeek.

O snapshot é salvo antes da chamada à IA: se a geração falhar, o registro factual permanece copiável.

Antes de gerar, uma **barreira de análise** levanta apontamentos — atrasos sem justificativa, entregas sem descrição de benefício — e exige resolução: justificar, marcar como replanejado (não é atraso) ou não reportar. Apontamentos críticos bloqueiam a geração; complementares viram `[a confirmar]` no texto.

Marcar como replanejado **não altera a data prevista**: ela pertence ao SGF, onde o replanejamento é formalizado. A marcação persiste entre períodos mas expira se o SGF mudar a data — a tabela guarda o planejado vigente no momento da resolução, justamente para não deixar o gestor cego para um desvio novo.

O prompt proíbe inventar: onde os dados não sustentam a afirmação, a saída escreve `[a confirmar: ...]` em vez de uma frase plausível. Um risco inventado passa pela análise do DN e vira compromisso.

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha as cinco:

- `SUPABASE_URL` — URL do projeto Supabase.
- Chave de service role do Supabase (nome da variável: `SUPABASE_SERVICE_ROLE_KEY`) — contorna Row Level Security e nunca deve chegar ao navegador; é lida só em Server Actions e Route Handlers, nos arquivos marcados com `import 'server-only'`.
- `APP_PASSWORD` — a senha única de acesso ao aplicativo, comparada em `/api/auth`.
- `SESSION_SECRET` — segredo usado para assinar o cookie de sessão (HMAC-SHA-256) depois do login. Sem relação com `APP_PASSWORD`: uma variável autentica, a outra assina a sessão resultante.
- `DEEPSEEK_API_KEY` — chave da API do DeepSeek, usada só na geração do monitoramento e no chat. Sem ela o aplicativo funciona normalmente: a coleta factual e o rascunho do monitoramento não dependem de IA.

## Rodando localmente

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). A primeira tela pede a senha de acesso; depois disso a sessão fica no cookie `farol_session` por 30 dias.

Outros scripts:

```bash
npm run build    # build de produção (webpack)
npm run start    # servidor de produção
npm run lint     # eslint
npm test         # vitest
```

## Aplicando migrations

As migrations vivem em `supabase/migrations/` e não são aplicadas automaticamente — não há Supabase CLI configurado neste ambiente. Para aplicar, abra o SQL Editor do projeto no painel do Supabase e cole o conteúdo de cada arquivo, em ordem numérica.

As onze estão aplicadas em produção:

| Arquivo | O que cria |
|---|---|
| `0001_initial_schema` | projetos, rubricas, lançamentos, lotes de import |
| `0002_import_key` | chave de idempotência correta do import do razão |
| `0003_app_settings` | padrões de limite e limiar |
| `0004_entry_notes` | observações e anexos editáveis no lançamento |
| `0005_aportes` | modalidade de financiamento; `baixa` passa a `aporte` |
| `0006_budget_control` | controle global ou por rubrica |
| `0007_identificacao_sgf` | nº do SGF, entidade, gestor |
| `0008_acompanhamento_fisico` | entregas, atividades, comentários |
| `0009_monitoramentos` | monitoramentos por período |
| `0010_analise_monitoramento` | apontamentos da barreira de análise |
| `0011_contexto_projeto` | documento do projeto como contexto da IA |

O código degrada quando uma migration ainda não foi aplicada: a leitura de configurações, por exemplo, captura o erro da consulta e devolve os defaults (25% e 80%) em vez de propagar a falha.

## Acesso ao banco

Todo acesso ao Supabase acontece no servidor — Server Actions (`lib/actions/`) e Route Handlers (`app/api/`) criados a partir de um cliente admin com a chave de service role, protegido por `import 'server-only'` (o build falha se esse módulo for importado por um Client Component). Não existe cliente Supabase de navegador neste projeto: nenhum componente `'use client'` fala diretamente com o banco, e a chave de service role nunca é enviada ao navegador.

## Deploy na Vercel

O deploy não foi executado a partir deste ambiente — fica a cargo de quem tem acesso à conta Vercel. Os passos:

```bash
git config user.email seu-email@dominio.com   # ver aviso abaixo
npx vercel@latest link
npx vercel@latest env add SUPABASE_URL production
npx vercel@latest env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel@latest env add APP_PASSWORD production
npx vercel@latest env add SESSION_SECRET production
npx vercel@latest --prod
```

Repita os quatro `env add` trocando `production` por `preview` — sem isso, qualquer branch de preview quebra na primeira query ao Supabase.

**Atenção ao `git config user.email`**: o endereço configurado precisa ser um dos e-mails associados à conta Vercel de quem vai fazer o deploy. Um e-mail de commit que a Vercel não reconhece como membro do time faz o deploy sair com status `BLOCKED` mesmo com o build passando — a causa não aparece nos logs de build, só na tela de deployments.

Depois do deploy, confira no DevTools do navegador (aba Network) que nenhuma resposta contém a chave de service role nem a string `service_role` — é a checagem de que a chave ficou só no servidor.

# Módulo de Acompanhamento Físico — registro de feature

**Data:** 2026-07-28
**Status:** registro de intenção — não especificado ao ponto de implementar
**Fonte dos dados:** dois relatórios extraídos do **SGF** para o projeto nº 340252.

- `relatorioCronogramaFisicoFinanceiro 28-07-2026 09_05_58.xls` — **a fonte de importação**.
  Apesar da extensão, é SpreadsheetML 2003 (XML), estruturado e legível pelo SheetJS.
- `_projeto_relatorioProjetoTemplate_28-07-2026_09-08-34.pdf` — contexto do projeto (dados
  cadastrais, equipe, histórico, monitoramento). Serve de referência, não de importação.

O relatório de saída (o monitoramento) ainda não foi definido.

---

## 1. Problema

O monitoramento dos projetos é quinzenal ou mensal, mas a execução acontece todo dia. Quando
chega a hora de escrever o monitoramento, o que foi feito no intervalo já se perdeu: atividades
concluídas, prazos que escorregaram e decisões tomadas ficam de fora porque ninguém registrou na
hora. O relatório do DN mede essa lacuna explicitamente — o projeto de referência exibe
*"Quantidade de dias sem Monitoramento DR: 28"*.

O escopo físico já existe e é aprovado junto com o projeto. O que falta é um lugar para registrar
o andamento continuamente e, ao fim do período, reunir tudo o que aconteceu.

## 2. O que o módulo faz

Traz o cronograma físico para dentro do Farol, ao lado do acompanhamento financeiro que já existe,
permitindo marcar avanço e comentar à medida que as coisas acontecem. No fechamento do período,
exporta o que foi realizado, alterado e comentado no intervalo, em formato adequado para uma IA
consolidar o texto do monitoramento.

O produto final não é o texto gerado — é o registro contínuo que torna o texto possível.

## 2b. Formato da fonte

O `.xls` do SGF tem duas abas.

**Aba `Entrega`** — 11 colunas, uma linha por atividade (30 no projeto de referência, em 10
entregas de 3 atividades cada):

| Coluna | Observação |
|---|---|
| Entrega | Só preenchida na **primeira linha de cada grupo** — célula mesclada |
| Atividade | |
| Tarefa | Terceiro nível, vazio em todo o arquivo |
| Responsável | Nome do dono da atividade |
| Data Início / Data Fim | Previstas |
| % de Realização | `0,00` ou `100,00` nos dados reais |
| Data Real do Início / da Finalização | Vazias enquanto não concluída |
| Status | `Concluido` ou `Em andamento` |
| Data da Atualização | Quando a linha foi tocada por último no SGF |

**Aba `Aquisições`** — liga o financeiro ao físico: Financiador (DN/DR), Conta Nível 5 e 6, Valor
Previsto, Valor Realizado, % de Realização, Status e **Entregas Vinculadas**. É por aqui que uma
compra se conecta à entrega que ela serve.

**Duas armadilhas do formato**, ambas verificadas contra o arquivo real:

1. **Encoding.** O prólogo declara `ISO-8859-1`, mas o SheetJS assume UTF-8 — sem decodificar
   antes, "Participação" chega como `Participa\ufffd\ufffdo`. Ler o arquivo como texto
   ISO-8859-1 e passar a string ao parser resolve.
2. **Células mescladas.** A coluna Entrega vem vazia em 20 das 30 linhas. Sem *forward fill*, dois
   terços das atividades ficam sem entrega.

## 3. Estrutura, conforme o relatório do DN

O vocabulário do sistema de origem é **Entrega → Atividade**. O termo "Ação" existe no relatório
com outro sentido (Linhas de Ações, Ação Predominante), então adotar "Entrega" evita ambiguidade
na hora de conversar com o DN.

```
Projeto
└── Entrega                          status: Registrado | Encerrado
    └── Atividade                    status: a Iniciar | Concluído
        ├── Data início previsto
        ├── Data início real
        ├── Data fim previsto
        ├── Data fim real
        └── Comentários (histórico cronológico)
```

Exemplo real do relatório:

| Entrega | Início prev. | Início real | Fim prev. | Fim real | Status |
|---|---|---|---|---|---|
| **Participação na Capacitação Vacinação 2026** | | | 31/03 | 14/04 | Encerrado |
| Planejar participação e definir representantes | 09/03 | 09/03 | 18/03 | 18/03 | Concluído |
| Participar da capacitação promovida pelo DN | 19/03 | 19/03 | 20/03 | 20/03 | Concluído |
| Registrar e sistematizar conteúdos | 23/03 | 23/03 | 31/03 | 14/04 | Concluído |

São **quatro datas por atividade**, não duas. O atraso de 14 dias na terceira atividade acima só é
visível porque previsto e real são guardados separadamente — reduzir a "prazo" e "realizado"
perderia essa leitura, que é justamente o que o monitoramento precisa explicar.

## 4. Funcionalidades

- Importação do escopo físico (entregas e atividades) com os prazos previstos
- Registro das datas reais de início e fim
- Status por atividade e por entrega
- Comentários datados em qualquer atividade ou entrega, com histórico cronológico preservado
- Filtro das movimentações por projeto, entrega, atividade e período
- Exportação do que mudou num intervalo, incluindo comentários
- Indicador de dias desde o último monitoramento registrado

## 4b. O destino: formulário PMO DR/AL

O monitoramento é entregue num **Microsoft Forms** mensal do PMO DR/AL, com seis campos de texto
livre além da identificação. Esse é o alvo da exportação — tudo que o módulo produz existe para
preencher estes campos.

| # | Campo do formulário | Origem no Farol |
|---|---|---|
| 1 | Nome ou Nº do Projeto no SGF | cadastro (o número do SGF, hoje ausente) |
| 2 | SESI ou SENAI | cadastro |
| 3 | Mês de referência | período selecionado na exportação |
| 4 | Nome do gestor | cadastro |
| 5 | **Cronograma físico** — marcos concluídos/adiados, variações, planos de ação | módulo físico: entregas e atividades com mudança de status no período, atrasos derivados de previsto × real, comentários registrados |
| 6 | **Resultados alcançados** e benefícios | comentários — é o campo que só existe se alguém escreveu; nenhum dado estruturado o produz |
| 7 | **Cronograma financeiro** — execução do mês, aquisições/contratações | módulo financeiro: lançamentos do período, execução acumulada, **remanejamento entre rubricas** |
| 8 | **Riscos** — descrição, probabilidade, impacto, mitigação, responsável, prazo | atrasos e baixa execução são detectáveis; probabilidade, mitigação e responsável são julgamento humano |
| 9 | **Conclusão e próximos passos** | atividades com início previsto no período seguinte + julgamento humano |

O manual do PMO (seção 4.3) pede, textualmente: *"Identificou-se a necessidade de remanejamento
entre as rubricas [rubricas], sem alteração do valor total aprovado para o projeto."* **É
exatamente o que o cálculo do teto de 25% já produz** — o módulo financeiro existente já é insumo
direto do campo 7, sem nada a construir.

O manual também adverte contra "expressões genéricas como 'projeto em andamento', 'atividades
realizadas normalmente' ou 'sem alterações'", e pede datas, percentuais, quantidades, valores e
nomes de entregas. Isso reforça a aposta do módulo: **o texto só fica específico se o registro
diário existir**. A IA não inventa o que ninguém anotou — ela organiza o que foi anotado.

### O que a IA não pode gerar

Campos 6, 8 e 9 dependem de julgamento: benefício percebido, probabilidade de um risco, decisão de
replanejar. O módulo alimenta o factual (o que mudou, quando, quanto) e deixa explícito o que
precisa de quem conhece o projeto. Prometer geração completa desses campos produziria texto
plausível e vazio — exatamente o que o manual proíbe.

## 4d. O fluxo é de mão dupla

O Farol não é só destino do escopo do SGF. Ele é onde o andamento é **registrado na hora**, e é
dele que saem as datas reais que depois precisam ser lançadas de volta no SGF. Na prática o gestor
não lembra, semanas depois, quando uma atividade começou ou terminou — e é essa lacuna que hoje
atrasa o fechamento no SGF (o próprio relatório mede: *"dias sem Monitoramento DR: 28"*).

```
SGF  ──[importa escopo]──►  Farol  ──[registro diário]──►  Farol
                              │
                              ├──[datas reais a lançar]──►  SGF
                              └──[monitoramento do período]──►  Forms PMO
```

Isso reordena as prioridades do módulo. A pergunta que a tela precisa responder melhor não é
"como está o projeto", e sim **"o que eu preciso fechar no SGF?"**.

### Consequência para a reimportação

Reimportar deixa de ser só uma operação de atualização e vira **conciliação**. A cada import, o
Farol compara o que veio do SGF com o que ele já sabe, e classifica cada atividade:

| Situação | Significado |
|---|---|
| Farol tem data real, SGF não | **pendente de lançamento no SGF** — é a fila de trabalho |
| SGF tem data que o Farol não tem | alguém lançou direto no SGF; o Farol absorve |
| Ambos têm, valores diferentes | divergência a resolver, mostrar os dois lados |
| Ambos iguais | conciliado, nada a fazer |
| Atividade nova no SGF | escopo mudou; entra sem tocar no que já existe |
| Atividade sumiu do SGF | escopo mudou; marcar, nunca apagar registro com histórico |

**O que o Farol registrou nunca é sobrescrito silenciosamente pelo import.** Comentários e datas
digitadas aqui são o trabalho que o módulo existe para preservar — a mesma lição que o import do
razão custou caro para aprender.

A tela principal do módulo físico decorre disso: uma lista de **pendências de sincronização**, não
um cronograma bonito. O cronograma é contexto; a fila é o produto.

## 4c. Navegação

O Farol mantém a instância geral com a lista de projetos. Dentro de um projeto, duas visões
irmãs, cada uma com sua medição:

```
/                          lista de projetos
/projetos/[id]             visão geral do projeto
   ├── Financeiro          orçamento, rubricas, lançamentos, import do razão   (existe)
   └── Físico              entregas, atividades, comentários, import do SGF    (a construir)
```

O dashboard do projeto passa a resumir as duas dimensões lado a lado — execução financeira e
execução física — que é como o monitoramento as reporta.

## 5. Relação com o módulo financeiro

O mesmo projeto aparece nos dois mundos com identificadores diferentes: no razão contábil pelo
**centro de custo** (`30413070101`), no sistema do DN pelo **número do projeto** (`340252`). Para
que físico e financeiro convivam na mesma tela, o cadastro precisa guardar os dois.

O relatório do DN também traz o financeiro consolidado (*Cronograma de Aquisições*: previsto
R$ 127.500,00, realizado R$ 58.792,90, 46,11%), o que abre a possibilidade de conferir o que o
Farol calcula a partir do razão contra o que o DN registra. Fora de escopo agora, mas é um uso
natural do dado.

## 6. Perguntas em aberto

Nenhuma destas está resolvida; todas mudam o desenho.

**Quem comenta.** O SGF já traz o responsável de cada atividade, então o *dono* é conhecido. O que
continua sem identificação é o autor de cada comentário registrado no Farol, já que o app tem uma
senha compartilhada e não sabe quem está digitando. Alternativa sem construir login: um seletor de
autor alimentado pela lista de responsáveis que veio do próprio SGF — resolve a atribuição no
monitoramento sem virar sistema de contas.

**Formato da exportação para a IA.** Texto corrido, Markdown estruturado, JSON? E o monitoramento
final é gerado dentro do Farol, ou o Farol só produz o insumo e a redação acontece fora?

**Sincronização.** O escopo físico muda ao longo do projeto (o relatório tem seção *Histórico
Solicitação de Mudança*). Reimportar precisa preservar os comentários e as datas reais já
registradas — mesmo problema de idempotência que o import do razão enfrentou, e que ali custou
uma correção de chave.

**Status intermediário.** Resolvido pelo `.xls`: o SGF usa `Concluido` e `Em andamento`, e ainda
traz `% de Realização` por atividade. Não é preciso inventar status nenhum.

**O que fazer com `% de Realização`.** O SGF já registra o percentual, hoje sempre 0 ou 100 nos
dados reais. Vale editar esse número no Farol, ou o par status + datas reais basta? Editar implica
decidir o que acontece com ele na reimportação.

## 7. Fora de escopo nesta versão

- Geração do texto do monitoramento por IA dentro do app
- Sincronização automática com o sistema do DN
- Conferência do financeiro do Farol contra o do DN
- Anexo de evidências às atividades

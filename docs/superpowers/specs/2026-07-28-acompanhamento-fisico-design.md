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

## 4b. O relatório de saída (monitoramento)

Ainda não definido. O mais próximo que o SGF traz é a seção **Monitoramento** (página 14 do
relatório), que é texto corrido assinado por um responsável do DR, com data de atualização. No
projeto de referência ele descreve objetivo, fase atual, situação do cronograma físico, situação
do cronograma financeiro e riscos — nessa ordem.

Se o monitoramento que você entrega tem esse formato, ele é o alvo: o módulo junta o que foi
realizado e comentado no período e a IA redige um texto nesse molde. **Confirmar antes de
desenhar a exportação**, porque o formato do insumo depende do formato do destino.

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

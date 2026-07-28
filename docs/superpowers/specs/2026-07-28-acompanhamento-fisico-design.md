# Módulo de Acompanhamento Físico — registro de feature

**Data:** 2026-07-28
**Status:** registro de intenção — não especificado ao ponto de implementar
**Fonte dos dados:** `~/Downloads/_projeto_relatorioProjetoTemplate_28-07-2026_09-08-34.pdf` —
relatório extraído do **SGF** com os dados do projeto nº 340252. É a **entrada** do módulo, de onde
o escopo físico vem. O relatório de saída (o monitoramento) é outra coisa e ainda não foi definido.

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

**Formato de saída do SGF.** O escopo físico vem do SGF, e hoje o que se tem dele é este PDF. Ler
PDF é frágil: o texto do cronograma físico sai com as colunas embaralhadas (o nome da atividade
aparece *depois* das datas na extração), e qualquer mudança no layout do relatório quebra o
parser em silêncio. Vale verificar antes de decidir: o SGF exporta o cronograma em `.xlsx` ou
`.csv`? Tem API? Se só houver o PDF, a alternativa mais segura é o cadastro manual usando o
relatório como referência — para este projeto são 10 entregas e ~30 atividades, digitáveis em uma
sentada, e só uma vez por projeto.

**Quem atualiza.** O app hoje não tem contas de usuário — tudo atrás de uma senha compartilhada. Um
histórico de comentários sem autor identificado tem valor limitado num monitoramento que precisa
dizer quem fez o quê. Isso pode forçar a revisão da decisão de não ter login.

**Formato da exportação para a IA.** Texto corrido, Markdown estruturado, JSON? E o monitoramento
final é gerado dentro do Farol, ou o Farol só produz o insumo e a redação acontece fora?

**Sincronização.** O escopo físico muda ao longo do projeto (o relatório tem seção *Histórico
Solicitação de Mudança*). Reimportar precisa preservar os comentários e as datas reais já
registradas — mesmo problema de idempotência que o import do razão enfrentou, e que ali custou
uma correção de chave.

**Status intermediário.** O relatório mostra apenas `a Iniciar` e `Concluído` nas atividades. Não
há "Em andamento". Para registro contínuo isso provavelmente é insuficiente — mas inventar status
que o DN não reconhece pode atrapalhar na hora de reportar.

## 7. Fora de escopo nesta versão

- Geração do texto do monitoramento por IA dentro do app
- Sincronização automática com o sistema do DN
- Conferência do financeiro do Farol contra o do DN
- Anexo de evidências às atividades

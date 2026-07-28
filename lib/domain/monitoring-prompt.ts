import type { ChatMessage } from '@/lib/ai/deepseek';
import type { MonitoringSnapshot } from './monitoring-snapshot';
import type { MonitoringFields } from './monitoring-render';

/**
 * Monta as mensagens enviadas à IA a partir do snapshot factual — puro, sem
 * rede, sem Supabase. `monitoring-render.ts` já produz um rascunho copiável
 * sem IA nenhuma; este módulo pede à IA para lapidar a prosa em cima dos
 * MESMOS fatos, nunca para inventar fatos novos.
 *
 * A instrução central, repetida à exaustão de propósito: um risco inventado
 * que passa pela revisão do gestor e do DN vira compromisso formal com o
 * PMO. É o erro que este prompt existe para evitar — por isso ele pede
 * `[a confirmar: ...]` sempre que a resposta depender de julgamento humano
 * que os dados não sustentam.
 */

const SYSTEM_PROMPT = `Você redige o monitoramento periódico de um projeto para o PMO DR/AL do SESI Alagoas (SESI-AL). O gestor vai copiar sua resposta direto no formulário Microsoft Forms do PMO, então escreva os cinco campos exatamente nesta estrutura e nesta ordem:

5. Desempenho físico — entregáveis concluídos e em andamento, atividades realizadas no período, atrasos com justificativa e impacto.
6. Resultados alcançados — o que foi entregue e qual benefício isso produziu.
7. Desempenho financeiro — compras e contratações, valor executado, necessidade de remanejamento entre rubricas, gasto previsto para o próximo período.
8. Riscos — para cada risco: descrição, probabilidade, impacto, mitigação, responsável e prazo.
9. Conclusão e próximos passos — o que falta, o que está em andamento, se o projeto está dentro do cronograma.

O manual do PMO proíbe expressamente frases genéricas como "projeto em andamento", "atividades realizadas normalmente" ou "sem alterações". Todo texto precisa trazer datas, percentuais, valores em reais e nomes de entregáveis — nunca uma frase que poderia valer para qualquer projeto.

Você não pode inventar. Risco, benefício e decisão de replanejamento exigem julgamento humano que você não tem: são o gestor e a Diretoria de Núcleo (DN) que avaliam isso, não você. Sempre que o registro factual fornecido não sustentar uma afirmação — um risco que não foi registrado, um benefício que não foi descrito, uma avaliação de cronograma que depende de contexto que você não recebeu — escreva um marcador entre colchetes no formato "[a confirmar: o que falta]" em vez de uma frase plausível. Um risco inventado que passa pela revisão do gestor e do DN vira compromisso formal com o PMO — é exatamente o erro que você precisa evitar.

Responda em português do Brasil, com acentuação correta, e devolva SOMENTE um objeto JSON válido, sem cercas de código markdown, com exatamente estas chaves de string: "desempenhoFisico", "resultados", "desempenhoFinanceiro", "riscos", "conclusao".`;

function line(label: string, value: string): string {
  return `${label}: ${value}`;
}

/** Serializa o snapshot em texto estruturado — o insumo bruto que a IA recebe, sem prosa pronta. */
function buildFactSheet(s: MonitoringSnapshot): string {
  const parts: string[] = [];

  parts.push(`Período do monitoramento: ${s.period.start} a ${s.period.end}.`);
  parts.push(`Data de referência para cálculo de atraso em aberto: ${s.referenceDate}.`);
  parts.push(
    `Período seguinte (para "próximos passos"): ${s.nextPeriod.start} a ${s.nextPeriod.end}.`,
  );

  parts.push('');
  parts.push(
    `Progresso físico: ${s.physicalProgress.before.concluded}/${s.physicalProgress.before.total} concluídas antes do período; ${s.physicalProgress.after.concluded}/${s.physicalProgress.after.total} concluídas até o fim do período.`,
  );

  parts.push('');
  parts.push(`Atividades concluídas no período (${s.concludedActivities.length}):`);
  for (const a of s.concludedActivities) {
    parts.push(
      `- [${a.id}] ${a.deliverableName} / ${a.name} — responsável: ${a.responsible ?? 'não informado'}; início real: ${a.actualStart ?? 'não informado'}; fim real: ${a.actualEnd}; planejado para: ${a.plannedEnd ?? 'não informado'}; dias de atraso: ${a.overdueDays}.`,
    );
  }

  parts.push('');
  parts.push(`Atividades em andamento (${s.inProgressActivities.length}):`);
  for (const a of s.inProgressActivities) {
    parts.push(
      `- [${a.id}] ${a.deliverableName} / ${a.name} — responsável: ${a.responsible ?? 'não informado'}; início real: ${a.actualStart}; previsão de término: ${a.plannedEnd ?? 'não informada'}.`,
    );
  }

  parts.push('');
  parts.push(`Atividades atrasadas (${s.delayedActivities.length}):`);
  for (const a of s.delayedActivities) {
    parts.push(
      `- [${a.id}] ${a.deliverableName} / ${a.name} — responsável: ${a.responsible ?? 'não informado'}; status: ${a.status}; planejado para: ${a.plannedEnd}; dias de atraso: ${a.daysLate}.`,
    );
  }

  parts.push('');
  parts.push(`Entregas concluídas integralmente no período (${s.concludedDeliverables.length}):`);
  for (const d of s.concludedDeliverables) {
    parts.push(`- [${d.id}] ${d.name} — ${d.activityCount} atividade(s); concluída em ${d.concludedAt}.`);
  }

  parts.push('');
  parts.push(`Comentários registrados no período, por atividade (${s.commentsByActivity.length} atividade(s) com comentário):`);
  for (const g of s.commentsByActivity) {
    parts.push(`- ${g.deliverableName} / ${g.activityName}:`);
    for (const c of g.comments) {
      parts.push(`  - ${c.happenedOn} (${c.author ?? 'autor não informado'}): ${c.body}`);
    }
  }

  parts.push('');
  const fin = s.financial;
  parts.push(
    line(
      'Financeiro do período',
      `${fin.periodEntries.length} lançamento(s), total ${fin.periodTotal}`,
    ),
  );
  parts.push(
    line(
      'Financeiro acumulado (ProjectSummary, não recalculado)',
      `orçamento total ${fin.summary.totalBudget}; realizado ${fin.summary.realized}; disponível ${fin.summary.available}; execução ${fin.summary.executionPct}%; remanejado ${fin.summary.transferred}; teto de remanejamento ${fin.summary.transferCap}; consumo do teto ${fin.summary.capUsagePct}%; status ${fin.summary.status}`,
    ),
  );

  parts.push('');
  parts.push(`Atividades previstas para começar no próximo período (${s.upcomingActivities.length}):`);
  for (const a of s.upcomingActivities) {
    parts.push(
      `- [${a.id}] ${a.deliverableName} / ${a.name} — responsável: ${a.responsible ?? 'não informado'}; início planejado: ${a.plannedStart}.`,
    );
  }

  return parts.join('\n');
}

export function buildMonitoringPromptMessages(snapshot: MonitoringSnapshot): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Registro factual do período (dados já apurados pelo Farol de Projetos — não recalcule nada, apenas escreva a prosa dos cinco campos a partir destes fatos):\n\n${buildFactSheet(snapshot)}`,
    },
  ];
}

const REQUIRED_KEYS: (keyof MonitoringFields)[] = [
  'desempenhoFisico',
  'resultados',
  'desempenhoFinanceiro',
  'riscos',
  'conclusao',
];

/**
 * Interpreta a resposta da IA como os cinco campos. Lança erro (mensagem em
 * PT-BR, sem detalhe técnico) se a IA não devolveu um JSON com as cinco
 * chaves esperadas — a rota que chama isto trata a falha sem perder o
 * snapshot já salvo.
 */
export function parseAiFields(raw: string): MonitoringFields {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('A IA não devolveu um JSON válido para os cinco campos do monitoramento.');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('A IA não devolveu um objeto com os cinco campos do monitoramento.');
  }

  const obj = parsed as Record<string, unknown>;
  for (const key of REQUIRED_KEYS) {
    if (typeof obj[key] !== 'string') {
      throw new Error(`A IA não devolveu o campo "${key}" como texto.`);
    }
  }

  return {
    desempenhoFisico: obj.desempenhoFisico as string,
    resultados: obj.resultados as string,
    desempenhoFinanceiro: obj.desempenhoFinanceiro as string,
    riscos: obj.riscos as string,
    conclusao: obj.conclusao as string,
  };
}

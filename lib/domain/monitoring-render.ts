import { formatBRL, formatDateBR } from '@/lib/format';
import type { MonitoringSnapshot } from './monitoring-snapshot';

/**
 * Rascunha os cinco campos de texto do formulário do PMO DR/AL a partir do
 * snapshot factual. Puro — sem IA, sem Supabase — e é o que o gestor pode
 * copiar mesmo sem gerar nada com IA, e também o texto-base que a IA recebe
 * para lapidar.
 *
 * Regra que atravessa tudo: nunca afirmar o que os dados não sustentam.
 * Onde a resposta exige julgamento humano (benefício de uma entrega, risco,
 * se os atrasos comprometem o prazo final), o texto marca
 * `[a confirmar: ...]` em vez de arriscar uma frase plausível — a mesma regra
 * que o prompt da IA reforça em `monitoring-prompt.ts`.
 */

export type MonitoringFields = {
  desempenhoFisico: string;
  resultados: string;
  desempenhoFinanceiro: string;
  riscos: string;
  conclusao: string;
};

function fmtDate(iso: string | null): string {
  return iso ? formatDateBR(iso) : '[a confirmar: sem data]';
}

function pct(concluded: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((concluded / total) * 1000) / 10;
}

function renderDesempenhoFisico(s: MonitoringSnapshot): string {
  const lines: string[] = [];
  const periodo = `${fmtDate(s.period.start)} a ${fmtDate(s.period.end)}`;

  const before = s.physicalProgress.before;
  const after = s.physicalProgress.after;
  lines.push(
    `No período de ${periodo}, o progresso físico do cronograma passou de ${before.concluded}/${before.total} (${pct(before.concluded, before.total)}%) para ${after.concluded}/${after.total} (${pct(after.concluded, after.total)}%) atividades concluídas.`,
  );

  lines.push('');
  if (s.concludedActivities.length === 0) {
    lines.push(`Nenhuma atividade foi concluída entre ${periodo}.`);
  } else {
    lines.push(`Atividades concluídas no período (${s.concludedActivities.length}):`);
    for (const a of s.concludedActivities) {
      const atraso =
        a.overdueDays > 0 && a.plannedEnd
          ? `, com ${a.overdueDays} dia(s) de atraso frente ao planejado (${fmtDate(a.plannedEnd)})`
          : '';
      lines.push(
        `- ${a.deliverableName} — ${a.name} (responsável: ${a.responsible ?? '[a confirmar: responsável não informado]'}), concluída em ${fmtDate(a.actualEnd)}${atraso}.`,
      );
    }
  }

  lines.push('');
  if (s.inProgressActivities.length === 0) {
    lines.push('Nenhuma atividade está em andamento no momento.');
  } else {
    lines.push(`Atividades em andamento (${s.inProgressActivities.length}):`);
    for (const a of s.inProgressActivities) {
      lines.push(
        `- ${a.deliverableName} — ${a.name}, iniciada em ${fmtDate(a.actualStart)}, previsão de término em ${a.plannedEnd ? fmtDate(a.plannedEnd) : '[a confirmar: sem data prevista cadastrada]'}.`,
      );
    }
  }

  lines.push('');
  if (s.delayedActivities.length === 0) {
    lines.push('Nenhuma atividade está atrasada frente ao planejado.');
  } else {
    lines.push(`Atividades atrasadas (${s.delayedActivities.length}):`);
    for (const a of s.delayedActivities) {
      if (a.status === 'em_aberto') {
        lines.push(
          `- ${a.deliverableName} — ${a.name}: previsto para ${fmtDate(a.plannedEnd)}, ${a.daysLate} dia(s) de atraso até ${fmtDate(s.referenceDate)}. [a confirmar: justificativa e impacto do atraso]`,
        );
      } else {
        lines.push(
          `- ${a.deliverableName} — ${a.name}: concluída com ${a.daysLate} dia(s) de atraso frente ao planejado (${fmtDate(a.plannedEnd)}). [a confirmar: justificativa do atraso]`,
        );
      }
    }
  }

  return lines.join('\n');
}

function renderResultados(s: MonitoringSnapshot): string {
  const lines: string[] = [];

  if (s.concludedDeliverables.length === 0) {
    lines.push(
      `Nenhuma entrega foi concluída integralmente entre ${fmtDate(s.period.start)} e ${fmtDate(s.period.end)}. [a confirmar: descreva resultados parciais e benefícios observados no período, se houver]`,
    );
  } else {
    lines.push(`Entregas concluídas no período (${s.concludedDeliverables.length}):`);
    for (const d of s.concludedDeliverables) {
      lines.push(
        `- ${d.name} (${d.activityCount} atividade(s)), finalizada em ${fmtDate(d.concludedAt)}. [a confirmar: descreva o benefício concreto gerado por esta entrega]`,
      );
    }
  }

  return lines.join('\n');
}

function renderDesempenhoFinanceiro(s: MonitoringSnapshot): string {
  const lines: string[] = [];
  const { periodEntries, periodTotal, summary } = s.financial;
  const periodo = `${fmtDate(s.period.start)} a ${fmtDate(s.period.end)}`;

  lines.push(
    `No período de ${periodo}, foram registrados ${periodEntries.length} lançamento(s), totalizando ${formatBRL(periodTotal)}.`,
  );

  if (periodEntries.length > 0) {
    lines.push('');
    lines.push('Compras e contratações do período:');
    for (const e of periodEntries) {
      const fornecedor = e.vendorName ? ` — ${e.vendorName}` : '';
      const descricao = e.description ? ` (${e.description})` : '';
      lines.push(`- ${formatBRL(e.amount)} em ${fmtDate(e.entryDate)}${fornecedor}${descricao}`);
    }
  }

  lines.push('');
  lines.push(
    `Execução financeira acumulada do projeto: ${formatBRL(summary.realized)} de ${formatBRL(summary.totalBudget)} (${summary.executionPct}% do orçamento total).`,
  );

  lines.push('');
  lines.push(
    `Remanejamento entre rubricas: ${formatBRL(summary.transferred)} de um teto de ${formatBRL(summary.transferCap)} (${summary.capUsagePct}% do teto consumido).`,
  );
  if (summary.status === 'aviso' || summary.status === 'violacao') {
    lines.push(
      `[a confirmar: avaliar necessidade de remanejamento adicional entre rubricas — consumo do teto em ${summary.capUsagePct}%, status ${summary.status}]`,
    );
  } else {
    lines.push('Não há indício, pelos números até aqui, de necessidade de remanejamento adicional entre rubricas.');
  }

  lines.push('');
  lines.push(
    '[a confirmar: gasto previsto para o próximo período — o Farol ainda não projeta desembolso futuro]',
  );

  return lines.join('\n');
}

function renderRiscos(s: MonitoringSnapshot): string {
  const lines: string[] = [];

  if (s.delayedActivities.length > 0) {
    lines.push('Pontos de atenção observados nos dados do período (não substituem a avaliação de risco do gestor):');
    for (const a of s.delayedActivities) {
      const detalhe =
        a.status === 'em_aberto'
          ? `em aberto, ${a.daysLate} dia(s) de atraso frente ao planejado (${fmtDate(a.plannedEnd)})`
          : `concluída com ${a.daysLate} dia(s) de atraso frente ao planejado (${fmtDate(a.plannedEnd)})`;
      lines.push(`- ${a.deliverableName} — ${a.name}: ${detalhe}.`);
    }
    lines.push('');
  }

  lines.push(
    '[a confirmar: nenhum risco foi cadastrado no Farol. Para cada risco identificado pelo gestor, descreva: descrição, probabilidade, impacto, mitigação, responsável e prazo.]',
  );

  return lines.join('\n');
}

function renderConclusao(s: MonitoringSnapshot): string {
  const lines: string[] = [];
  const after = s.physicalProgress.after;

  lines.push(
    `Do total de ${after.total} atividade(s) do cronograma, ${after.concluded} estão concluídas (${pct(after.concluded, after.total)}%) até ${fmtDate(s.period.end)}.`,
  );

  lines.push('');
  const abertos = s.delayedActivities.filter((a) => a.status === 'em_aberto');
  if (abertos.length === 0) {
    lines.push('O projeto está em dia com o cronograma planejado, sem atividades em aberto atrasadas.');
  } else {
    lines.push(`${abertos.length} atividade(s) em aberto está(ão) atrasada(s) frente ao planejado:`);
    for (const a of abertos) {
      lines.push(`- ${a.deliverableName} — ${a.name}: ${a.daysLate} dia(s) de atraso.`);
    }
    lines.push('[a confirmar: avaliar se estes atrasos comprometem o prazo final do projeto]');
  }

  lines.push('');
  if (s.upcomingActivities.length === 0) {
    lines.push(
      `Nenhuma atividade tem início planejado entre ${fmtDate(s.nextPeriod.start)} e ${fmtDate(s.nextPeriod.end)}.`,
    );
  } else {
    lines.push(
      `Próximos passos — atividades com início planejado entre ${fmtDate(s.nextPeriod.start)} e ${fmtDate(s.nextPeriod.end)}:`,
    );
    for (const a of s.upcomingActivities) {
      lines.push(
        `- ${a.deliverableName} — ${a.name}, início previsto em ${fmtDate(a.plannedStart)} (responsável: ${a.responsible ?? '[a confirmar: responsável não informado]'}).`,
      );
    }
  }

  return lines.join('\n');
}

export function renderMonitoringMarkdown(snapshot: MonitoringSnapshot): MonitoringFields {
  return {
    desempenhoFisico: renderDesempenhoFisico(snapshot),
    resultados: renderResultados(snapshot),
    desempenhoFinanceiro: renderDesempenhoFinanceiro(snapshot),
    riscos: renderRiscos(snapshot),
    conclusao: renderConclusao(snapshot),
  };
}

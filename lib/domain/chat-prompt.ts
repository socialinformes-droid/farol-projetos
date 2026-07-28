import type { ChatMessage } from '@/lib/ai/deepseek';
import type { ProjectChatContext } from './chat-context';
import { formatBRL, formatDateBR } from '@/lib/format';

/**
 * Monta as mensagens do chat lateral a partir do contexto do projeto — puro,
 * sem rede, sem Supabase. Este app alimenta relatório para um órgão de
 * fiscalização externo (o PMO DR/AL): um número inventado na conversa é
 * muito pior do que "não tenho esse dado aqui", por isso a instrução central
 * do prompt é a mesma proibição de invenção que rege `monitoring-prompt.ts`,
 * adaptada para perguntas livres em vez de um formulário fixo.
 */

const SYSTEM_PROMPT_HEADER = `Você responde perguntas sobre um projeto do Farol de Projetos, para o gestor do SESI Alagoas (SESI-AL). Este sistema alimenta relatórios para um órgão de fiscalização externo — um número, data ou situação inventada é muito pior do que admitir que você não sabe.

Responda SOMENTE com base nos dados do projeto fornecidos abaixo. Nunca invente valores, datas, nomes, riscos ou situações que não estejam explicitamente nestes dados. Quando a pergunta não puder ser respondida com o que foi fornecido, diga isso claramente — por exemplo "Não tenho esse dado aqui" — em vez de arriscar um palpite ou estimativa.

Se os dados do projeto trouxerem uma seção "Documento do projeto", ela descreve o que foi PROMETIDO — objetivo e escopo, extraídos do relatório do SGF. Use-a só para explicar o propósito e o escopo do projeto. Nunca a trate como execução: não afirme que algo dali foi feito, iniciado ou concluído — isso só pode vir dos dados de cronograma e financeiro, também fornecidos abaixo.

Responda em português do Brasil, com acentuação correta, de forma breve e direta.`;

function renderContext(ctx: ProjectChatContext): string {
  const lines: string[] = [];

  lines.push(
    `Projeto: ${ctx.projectName} (${ctx.projectCode})${ctx.sgfNumber ? `, SGF ${ctx.sgfNumber}` : ''}.`,
  );
  if (ctx.managerName) lines.push(`Gestor responsável: ${ctx.managerName}.`);
  lines.push(`Modelo de financiamento: ${ctx.fundingModel}. Controle orçamentário: ${ctx.budgetControl}.`);

  lines.push('');
  lines.push(
    `Orçamento total: ${formatBRL(ctx.totalBudget)}. Executado: ${formatBRL(ctx.realized)} (${ctx.executionPct}% do orçamento). Disponível: ${formatBRL(ctx.available)}.`,
  );
  lines.push(
    `Remanejamento entre rubricas: ${formatBRL(ctx.transferred)} de um teto de ${formatBRL(ctx.transferCap)} (${ctx.capUsagePct}% do teto consumido).`,
  );

  lines.push('');
  lines.push(
    `Cronograma físico: ${ctx.deliverableCount} entrega(s) cadastrada(s), ${ctx.concludedActivityCount} de ${ctx.activityCount} atividade(s) concluídas (${ctx.physicalProgressPct}% de progresso físico).`,
  );

  lines.push('');
  if (ctx.delayedActivities.length === 0) {
    lines.push('Nenhuma atividade atrasada no momento.');
  } else {
    lines.push(`Atividades atrasadas agora (amostra, ${ctx.delayedActivities.length}):`);
    for (const a of ctx.delayedActivities) {
      lines.push(`- ${a.deliverableName} — ${a.activityName}: ${a.daysLate} dia(s) de atraso.`);
    }
  }

  if (ctx.projectContext) {
    lines.push('');
    lines.push(
      `Documento do projeto (o que foi PROMETIDO — objetivo e escopo; NÃO é evidência de execução):`,
    );
    lines.push(ctx.projectContext);
  }

  lines.push('');
  if (ctx.recentEntries.length === 0) {
    lines.push('Nenhum lançamento financeiro disponível na amostra recente.');
  } else {
    lines.push(`Lançamentos financeiros recentes (amostra, não é o histórico completo, ${ctx.recentEntries.length}):`);
    for (const e of ctx.recentEntries) {
      const fornecedor = e.vendorName ? ` — ${e.vendorName}` : '';
      const descricao = e.description ? ` (${e.description})` : '';
      lines.push(`- ${formatDateBR(e.date)}: ${formatBRL(e.amount)}${fornecedor}${descricao}`);
    }
  }

  return lines.join('\n');
}

/** Limite de segurança: mesmo que o cliente envie mais, só as últimas N mensagens da conversa entram na chamada — evita payload sem limite. */
export const MAX_HISTORY_MESSAGES = 20;

export function buildChatMessages(ctx: ProjectChatContext, history: ChatMessage[]): ChatMessage[] {
  const system: ChatMessage = {
    role: 'system',
    content: `${SYSTEM_PROMPT_HEADER}\n\nDados do projeto:\n${renderContext(ctx)}`,
  };
  const boundedHistory = history.slice(-MAX_HISTORY_MESSAGES);
  return [system, ...boundedHistory];
}

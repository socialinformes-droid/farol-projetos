import { describe, it, expect } from 'vitest';
import { buildMonitoringPromptMessages, parseAiFields } from './monitoring-prompt';
import type { MonitoringSnapshot, ConcludedActivity, DelayedActivity } from './monitoring-snapshot';
import type { ProjectSummary } from './budget';
import type { ResolvedFinding } from './monitoring-findings';

function summary(over: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    totalBudget: 1000,
    realized: 400,
    available: 600,
    executionPct: 40,
    transferred: 50,
    transferCap: 100,
    capUsagePct: 50,
    contributions: 0,
    cashBalance: null,
    fundingModel: 'interno',
    budgetControl: 'por_rubrica',
    unclassifiedTotal: 0,
    linesWithoutBudget: 0,
    overBudget: false,
    status: 'ok',
    lines: [],
    ...over,
  };
}

function snapshot(over: Partial<MonitoringSnapshot> = {}): MonitoringSnapshot {
  return {
    period: { start: '2026-07-01', end: '2026-07-31' },
    referenceDate: '2026-08-05',
    nextPeriod: { start: '2026-08-01', end: '2026-08-31' },
    concludedActivities: [],
    inProgressActivities: [],
    delayedActivities: [],
    concludedDeliverables: [],
    physicalProgress: { before: { concluded: 0, total: 0 }, after: { concluded: 0, total: 0 } },
    commentsByActivity: [],
    financial: { periodEntries: [], periodTotal: 0, summary: summary() },
    upcomingActivities: [],
    ...over,
  };
}

describe('buildMonitoringPromptMessages', () => {
  it('devolve uma mensagem system e uma user', () => {
    const messages = buildMonitoringPromptMessages(snapshot());
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('a mensagem system descreve o papel (PMO DR/AL de Alagoas) e a estrutura dos cinco campos', () => {
    const [system] = buildMonitoringPromptMessages(snapshot());
    expect(system.content).toContain('PMO DR/AL');
    expect(system.content).toContain('SESI');
    expect(system.content).toContain('Alagoas');
    expect(system.content).toContain('Desempenho físico');
    expect(system.content).toContain('Resultados alcançados');
    expect(system.content).toContain('Desempenho financeiro');
    expect(system.content).toContain('Riscos');
    expect(system.content).toContain('Conclusão e próximos passos');
  });

  it('a mensagem system proíbe frases genéricas e exige datas, percentuais, valores e nomes', () => {
    const [system] = buildMonitoringPromptMessages(snapshot());
    expect(system.content.toLowerCase()).toContain('projeto em andamento');
    expect(system.content.toLowerCase()).toContain('atividades realizadas normalmente');
    expect(system.content.toLowerCase()).toContain('sem alterações');
    expect(system.content).toMatch(/datas.*percentu|percentu.*datas|percentuais/i);
  });

  it('a mensagem system exige o placeholder [a confirmar] em vez de invenção para riscos, benefícios e replanejamento', () => {
    const [system] = buildMonitoringPromptMessages(snapshot());
    expect(system.content).toContain('[a confirmar');
    expect(system.content.toLowerCase()).toContain('não pode inventar');
    expect(system.content.toLowerCase()).toContain('risco');
    expect(system.content.toLowerCase()).toContain('benefício');
  });

  it('a mensagem user carrega os números reais do snapshot (não genéricos)', () => {
    const concluded: ConcludedActivity = {
      id: 'a1',
      deliverableName: 'Entrega A',
      name: 'Atividade Especial',
      responsible: 'Fulano',
      actualStart: '2026-07-01',
      actualEnd: '2026-07-20',
      plannedStart: null,
      plannedEnd: '2026-07-15',
      overdueDays: 5,
    };
    const delayed: DelayedActivity = {
      id: 'a2',
      deliverableName: 'Entrega B',
      name: 'Atividade Atrasada',
      responsible: 'Beltrano',
      plannedStart: null,
      plannedEnd: '2026-07-10',
      daysLate: 26,
      status: 'em_aberto',
    };
    const s = snapshot({
      concludedActivities: [concluded],
      delayedActivities: [delayed],
      financial: {
        periodEntries: [],
        periodTotal: 12345.67,
        summary: summary({ realized: 999, totalBudget: 5000 }),
      },
    });
    const [, user] = buildMonitoringPromptMessages(s);
    expect(user.content).toContain('Atividade Especial');
    expect(user.content).toContain('Entrega A');
    expect(user.content).toContain('Atividade Atrasada');
    expect(user.content).toContain('26');
    expect(user.content).toContain('2026-07-01');
    expect(user.content).toContain('2026-07-31');
    expect(user.content).toContain('12345.67');
    expect(user.content).toContain('999');
    expect(user.content).toContain('5000');
  });

  it('apontamento JUSTIFICADO entra como fato afirmável (a nota do gestor aparece no texto)', () => {
    const justificado: ResolvedFinding = {
      activityId: 'a1',
      kind: 'sem_justificativa',
      severity: 'critico',
      description: 'Entrega A — Atividade X: em aberto, 10 dia(s) de atraso.',
      deliverableName: 'Entrega A',
      activityName: 'Atividade X',
      plannedStart: null,
      plannedEnd: '2026-07-01',
      resolution: 'justificado',
      note: 'Fornecedor atrasou a entrega do material didático',
      resolvedBy: 'Gestor Fulano',
      resolvedAt: '2026-07-20T00:00:00.000Z',
    };
    const [, user] = buildMonitoringPromptMessages(snapshot(), [justificado]);
    expect(user.content).toContain('JUSTIFICADO');
    expect(user.content).toContain('Fornecedor atrasou a entrega do material didático');
    expect(user.content.toLowerCase()).toContain('fato');
  });

  it('quando há documento do projeto, a mensagem user traz uma seção delimitada com o texto e o aviso de que não é evidência de execução', () => {
    const [system, user] = buildMonitoringPromptMessages(
      snapshot(),
      [],
      'JUSTIFICATIVA\nEste projeto visa capacitar equipes de SST em todo o estado.\nOBJETIVO GERAL\nReduzir acidentes de trabalho.',
    );
    expect(user.content).toContain('Documento do projeto');
    expect(user.content).toContain('capacitar equipes de SST');
    expect(user.content).toContain('Reduzir acidentes de trabalho');
    expect(user.content.toLowerCase()).toContain('não é evidência de execução');
    expect(system.content.toLowerCase()).toContain('documento do projeto');
  });

  it('quando não há documento do projeto, a mensagem user não traz a seção "Documento do projeto"', () => {
    const [, user] = buildMonitoringPromptMessages(snapshot());
    expect(user.content).not.toContain('Documento do projeto');
  });

  it('documento do projeto vazio ou só espaços em branco também omite a seção', () => {
    const [, userEmpty] = buildMonitoringPromptMessages(snapshot(), [], '');
    expect(userEmpty.content).not.toContain('Documento do projeto');
    const [, userBlank] = buildMonitoringPromptMessages(snapshot(), [], '   \n  ');
    expect(userBlank.content).not.toContain('Documento do projeto');
  });

  it('apontamento REPLANEJADO é descrito explicitamente como NÃO sendo atraso', () => {
    const replanejado: ResolvedFinding = {
      activityId: 'a2',
      kind: 'sem_justificativa',
      severity: 'critico',
      description: 'Entrega B — Curso de capacitação: em aberto, 53 dia(s) de atraso.',
      deliverableName: 'Entrega B',
      activityName: 'Curso de capacitação',
      plannedStart: null,
      plannedEnd: '2026-08-01',
      resolution: 'replanejado',
      note: 'Data alterada no SGF a pedido do fornecedor',
      resolvedBy: 'Gestor Fulano',
      resolvedAt: '2026-07-20T00:00:00.000Z',
    };
    const [system, user] = buildMonitoringPromptMessages(snapshot(), [replanejado]);
    expect(user.content).toContain('REPLANEJADO');
    expect(user.content.toLowerCase()).toContain('não é atraso');
    expect(user.content).toContain('Curso de capacitação');
    // A instrução também precisa estar no system prompt, não só no fato —
    // senão a IA pode ignorar o rótulo e relatar como atraso mesmo assim.
    expect(system.content.toLowerCase()).toContain('replanejado');
    expect(system.content.toLowerCase()).toContain('não é atraso');
  });
});

describe('parseAiFields', () => {
  const valid = {
    desempenhoFisico: 'texto 1',
    resultados: 'texto 2',
    desempenhoFinanceiro: 'texto 3',
    riscos: 'texto 4',
    conclusao: 'texto 5',
  };

  it('faz parse de um JSON válido', () => {
    const fields = parseAiFields(JSON.stringify(valid));
    expect(fields).toEqual(valid);
  });

  it('remove cercas de código markdown (```json ... ```) antes de parsear', () => {
    const raw = '```json\n' + JSON.stringify(valid) + '\n```';
    const fields = parseAiFields(raw);
    expect(fields).toEqual(valid);
  });

  it('lança erro quando falta algum campo obrigatório', () => {
    const incomplete = { ...valid, riscos: undefined };
    expect(() => parseAiFields(JSON.stringify(incomplete))).toThrow();
  });

  it('lança erro quando o texto não é JSON válido', () => {
    expect(() => parseAiFields('isto não é json')).toThrow();
  });
});

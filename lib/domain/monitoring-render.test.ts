import { describe, it, expect } from 'vitest';
import { renderMonitoringMarkdown } from './monitoring-render';
import { formatBRL } from '@/lib/format';
import type {
  MonitoringSnapshot,
  ConcludedActivity,
  InProgressActivity,
  DelayedActivity,
  ConcludedDeliverableInfo,
  UpcomingActivity,
} from './monitoring-snapshot';
import type { ProjectSummary } from './budget';

const BANNED_PHRASES = [
  'projeto em andamento',
  'atividades realizadas normalmente',
  'sem alterações',
];

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

function emptySnapshot(over: Partial<MonitoringSnapshot> = {}): MonitoringSnapshot {
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

describe('renderMonitoringMarkdown', () => {
  it('nunca usa as frases genéricas proibidas pelo manual do PMO', () => {
    const snapshot = emptySnapshot();
    const fields = renderMonitoringMarkdown(snapshot);
    const allText = Object.values(fields).join('\n').toLowerCase();
    for (const phrase of BANNED_PHRASES) {
      expect(allText).not.toContain(phrase);
    }
  });

  it('período vazio ainda produz texto com datas concretas em vez de silêncio', () => {
    const snapshot = emptySnapshot();
    const fields = renderMonitoringMarkdown(snapshot);
    expect(fields.desempenhoFisico).toContain('01/07/2026');
    expect(fields.desempenhoFisico).toContain('31/07/2026');
    expect(fields.desempenhoFisico.length).toBeGreaterThan(0);
  });

  it('desempenho físico lista atividades concluídas, em andamento e atrasadas com números concretos', () => {
    const concluded: ConcludedActivity = {
      id: 'a1',
      deliverableName: 'Entrega A',
      name: 'Atividade 1',
      responsible: 'Fulano',
      actualStart: '2026-07-01',
      actualEnd: '2026-07-15',
      plannedStart: null,
      plannedEnd: '2026-07-10',
      overdueDays: 5,
    };
    const inProgress: InProgressActivity = {
      id: 'a2',
      deliverableName: 'Entrega B',
      name: 'Atividade 2',
      responsible: 'Beltrano',
      actualStart: '2026-07-20',
      plannedStart: null,
      plannedEnd: '2026-08-10',
    };
    const delayed: DelayedActivity = {
      id: 'a3',
      deliverableName: 'Entrega C',
      name: 'Atividade 3',
      responsible: 'Ciclano',
      plannedStart: null,
      plannedEnd: '2026-07-20',
      daysLate: 16,
      status: 'em_aberto',
    };
    const snapshot = emptySnapshot({
      concludedActivities: [concluded],
      inProgressActivities: [inProgress],
      delayedActivities: [delayed],
      physicalProgress: { before: { concluded: 2, total: 10 }, after: { concluded: 3, total: 10 } },
    });
    const fields = renderMonitoringMarkdown(snapshot);
    expect(fields.desempenhoFisico).toContain('Atividade 1');
    expect(fields.desempenhoFisico).toContain('Entrega A');
    expect(fields.desempenhoFisico).toContain('5 dia'); // atraso da concluída
    expect(fields.desempenhoFisico).toContain('Atividade 2');
    expect(fields.desempenhoFisico).toContain('Atividade 3');
    expect(fields.desempenhoFisico).toContain('16 dia');
    expect(fields.desempenhoFisico).toContain('2/10');
    expect(fields.desempenhoFisico).toContain('3/10');
  });

  it('resultados alcançados lista entregas concluídas e marca placeholder de benefício', () => {
    const deliverable: ConcludedDeliverableInfo = {
      id: 'd1',
      name: 'Entrega A',
      concludedAt: '2026-07-20',
      closingActivityId: 'act-fech',
      activityCount: 4,
    };
    const snapshot = emptySnapshot({ concludedDeliverables: [deliverable] });
    const fields = renderMonitoringMarkdown(snapshot);
    expect(fields.resultados).toContain('Entrega A');
    expect(fields.resultados).toContain('20/07/2026');
    expect(fields.resultados).toContain('[a confirmar');
  });

  it('resultados sem entregas concluídas ainda assim traz texto específico com placeholder', () => {
    const fields = renderMonitoringMarkdown(emptySnapshot());
    expect(fields.resultados).toContain('[a confirmar');
    expect(fields.resultados.length).toBeGreaterThan(0);
  });

  it('desempenho financeiro traz valores em reais e o remanejamento entre rubricas', () => {
    const snapshot = emptySnapshot({
      financial: {
        periodEntries: [
          {
            entryDate: '2026-07-10',
            amount: 500,
            kind: 'despesa',
            description: 'Compra de equipamento',
            vendorName: 'Fornecedor X',
          },
        ],
        periodTotal: 500,
        summary: summary({ realized: 400, totalBudget: 1000, transferred: 50, transferCap: 100 }),
      },
    });
    const fields = renderMonitoringMarkdown(snapshot);
    expect(fields.desempenhoFinanceiro).toContain(formatBRL(500));
    expect(fields.desempenhoFinanceiro).toContain(formatBRL(400));
    expect(fields.desempenhoFinanceiro).toContain(formatBRL(1000));
    expect(fields.desempenhoFinanceiro).toContain('Fornecedor X');
  });

  it('desempenho financeiro alerta remanejamento quando o status é aviso ou violação', () => {
    const snapshot = emptySnapshot({
      financial: {
        periodEntries: [],
        periodTotal: 0,
        summary: summary({ status: 'violacao', capUsagePct: 120 }),
      },
    });
    const fields = renderMonitoringMarkdown(snapshot);
    expect(fields.desempenhoFinanceiro).toContain('[a confirmar');
  });

  it('riscos sempre exige preenchimento humano (placeholder obrigatório)', () => {
    const fields = renderMonitoringMarkdown(emptySnapshot());
    expect(fields.riscos).toContain('[a confirmar');
    expect(fields.riscos.toLowerCase()).toContain('probabilidade');
    expect(fields.riscos.toLowerCase()).toContain('mitigação');
  });

  it('riscos relaciona atrasos observados como ponto de atenção factual', () => {
    const delayed: DelayedActivity = {
      id: 'a3',
      deliverableName: 'Entrega C',
      name: 'Atividade 3',
      responsible: 'Ciclano',
      plannedStart: null,
      plannedEnd: '2026-07-20',
      daysLate: 16,
      status: 'em_aberto',
    };
    const fields = renderMonitoringMarkdown(emptySnapshot({ delayedActivities: [delayed] }));
    expect(fields.riscos).toContain('Atividade 3');
    expect(fields.riscos).toContain('16 dia');
  });

  it('conclusão declara projeto em dia quando não há atraso em aberto', () => {
    const fields = renderMonitoringMarkdown(emptySnapshot());
    expect(fields.conclusao.toLowerCase()).toContain('em dia');
  });

  it('conclusão lista atraso em aberto e pede confirmação sobre impacto no prazo final', () => {
    const delayed: DelayedActivity = {
      id: 'a3',
      deliverableName: 'Entrega C',
      name: 'Atividade 3',
      responsible: 'Ciclano',
      plannedStart: null,
      plannedEnd: '2026-07-20',
      daysLate: 16,
      status: 'em_aberto',
    };
    const fields = renderMonitoringMarkdown(emptySnapshot({ delayedActivities: [delayed] }));
    expect(fields.conclusao).toContain('16 dia');
    expect(fields.conclusao).toContain('[a confirmar');
  });

  it('conclusão lista atividades previstas para o próximo período', () => {
    const upcoming: UpcomingActivity = {
      id: 'u1',
      deliverableName: 'Entrega D',
      name: 'Atividade 4',
      responsible: 'Sicrano',
      plannedStart: '2026-08-05',
    };
    const fields = renderMonitoringMarkdown(emptySnapshot({ upcomingActivities: [upcoming] }));
    expect(fields.conclusao).toContain('Atividade 4');
    expect(fields.conclusao).toContain('05/08/2026');
  });
});

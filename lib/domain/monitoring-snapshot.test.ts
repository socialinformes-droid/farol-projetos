import { describe, it, expect } from 'vitest';
import {
  buildMonitoringSnapshot,
  type MonitoringActivityInput,
  type MonitoringDeliverableInput,
  type MonitoringCommentInput,
  type MonitoringEntryInput,
} from './monitoring-snapshot';
import type { ProjectSummary } from './budget';

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

function activity(over: Partial<MonitoringActivityInput> = {}): MonitoringActivityInput {
  return {
    id: 'act-1',
    deliverableId: 'del-1',
    deliverableName: 'Entrega A',
    name: 'Atividade 1',
    responsible: 'Fulano',
    plannedStart: '2026-06-01',
    plannedEnd: '2026-06-30',
    actualStart: null,
    actualEnd: null,
    archived: false,
    ...over,
  };
}

function deliverable(over: Partial<MonitoringDeliverableInput> = {}): MonitoringDeliverableInput {
  return { id: 'del-1', name: 'Entrega A', archived: false, ...over };
}

const period = { start: '2026-07-01', end: '2026-07-31' };
const referenceDate = '2026-08-05';

describe('buildMonitoringSnapshot', () => {
  it('período vazio (sem atividades, comentários ou lançamentos) devolve estrutura vazia mas válida', () => {
    const snapshot = buildMonitoringSnapshot({
      period,
      referenceDate,
      activities: [],
      deliverables: [],
      comments: [],
      entries: [],
      summary: summary(),
    });

    expect(snapshot.concludedActivities).toEqual([]);
    expect(snapshot.inProgressActivities).toEqual([]);
    expect(snapshot.delayedActivities).toEqual([]);
    expect(snapshot.concludedDeliverables).toEqual([]);
    expect(snapshot.commentsByActivity).toEqual([]);
    expect(snapshot.upcomingActivities).toEqual([]);
    expect(snapshot.physicalProgress.before).toEqual({ concluded: 0, total: 0 });
    expect(snapshot.physicalProgress.after).toEqual({ concluded: 0, total: 0 });
    expect(snapshot.financial.periodTotal).toBe(0);
    expect(snapshot.financial.periodEntries).toEqual([]);
    expect(snapshot.financial.summary).toEqual(summary());
  });

  describe('atividades concluídas', () => {
    it('inclui atividade concluída exatamente no início do período', () => {
      const act = activity({ actualStart: '2026-06-20', actualEnd: period.start });
      const snapshot = buildMonitoringSnapshot({
        period,
        referenceDate,
        activities: [act],
        deliverables: [deliverable()],
        comments: [],
        entries: [],
        summary: summary(),
      });
      expect(snapshot.concludedActivities).toHaveLength(1);
      expect(snapshot.concludedActivities[0].id).toBe('act-1');
    });

    it('inclui atividade concluída exatamente no fim do período', () => {
      const act = activity({ actualStart: '2026-06-20', actualEnd: period.end });
      const snapshot = buildMonitoringSnapshot({
        period,
        referenceDate,
        activities: [act],
        deliverables: [deliverable()],
        comments: [],
        entries: [],
        summary: summary(),
      });
      expect(snapshot.concludedActivities).toHaveLength(1);
    });

    it('exclui atividade concluída um dia depois do fim do período', () => {
      const act = activity({ actualStart: '2026-06-20', actualEnd: '2026-08-01' });
      const snapshot = buildMonitoringSnapshot({
        period,
        referenceDate,
        activities: [act],
        deliverables: [deliverable()],
        comments: [],
        entries: [],
        summary: summary(),
      });
      expect(snapshot.concludedActivities).toHaveLength(0);
    });

    it('exclui atividade concluída um dia antes do início do período', () => {
      const act = activity({ actualStart: '2026-06-01', actualEnd: '2026-06-30' });
      const snapshot = buildMonitoringSnapshot({
        period,
        referenceDate,
        activities: [act],
        deliverables: [deliverable()],
        comments: [],
        entries: [],
        summary: summary(),
      });
      expect(snapshot.concludedActivities).toHaveLength(0);
    });

    it('marca o atraso (overdueDays) quando a conclusão real passou do planejado', () => {
      const act = activity({
        actualStart: '2026-06-20',
        actualEnd: '2026-07-15',
        plannedEnd: '2026-07-10',
      });
      const snapshot = buildMonitoringSnapshot({
        period,
        referenceDate,
        activities: [act],
        deliverables: [deliverable()],
        comments: [],
        entries: [],
        summary: summary(),
      });
      expect(snapshot.concludedActivities[0].overdueDays).toBe(5);
    });

    it('ignora atividade arquivada', () => {
      const act = activity({ actualStart: '2026-06-20', actualEnd: period.end, archived: true });
      const snapshot = buildMonitoringSnapshot({
        period,
        referenceDate,
        activities: [act],
        deliverables: [deliverable()],
        comments: [],
        entries: [],
        summary: summary(),
      });
      expect(snapshot.concludedActivities).toHaveLength(0);
    });
  });

  describe('atividades em andamento', () => {
    it('inclui atividade iniciada antes do período e ainda sem fim real', () => {
      const act = activity({ actualStart: '2026-06-15', actualEnd: null });
      const snapshot = buildMonitoringSnapshot({
        period,
        referenceDate,
        activities: [act],
        deliverables: [deliverable()],
        comments: [],
        entries: [],
        summary: summary(),
      });
      expect(snapshot.inProgressActivities).toHaveLength(1);
    });

    it('inclui atividade iniciada dentro do período e ainda sem fim real', () => {
      const act = activity({ actualStart: '2026-07-10', actualEnd: null });
      const snapshot = buildMonitoringSnapshot({
        period,
        referenceDate,
        activities: [act],
        deliverables: [deliverable()],
        comments: [],
        entries: [],
        summary: summary(),
      });
      expect(snapshot.inProgressActivities).toHaveLength(1);
    });

    it('exclui atividade que ainda nem começou', () => {
      const act = activity({ actualStart: null, actualEnd: null });
      const snapshot = buildMonitoringSnapshot({
        period,
        referenceDate,
        activities: [act],
        deliverables: [deliverable()],
        comments: [],
        entries: [],
        summary: summary(),
      });
      expect(snapshot.inProgressActivities).toHaveLength(0);
    });

    it('exclui atividade cujo início real é depois do fim do período (ainda não chegou nesse ponto)', () => {
      const act = activity({ actualStart: '2026-08-10', actualEnd: null });
      const snapshot = buildMonitoringSnapshot({
        period,
        referenceDate,
        activities: [act],
        deliverables: [deliverable()],
        comments: [],
        entries: [],
        summary: summary(),
      });
      expect(snapshot.inProgressActivities).toHaveLength(0);
    });
  });

  describe('atividades atrasadas', () => {
    it('atividade não concluída com planejado no passado entra como em_aberto, com dias de atraso contados da data de referência', () => {
      const act = activity({
        plannedEnd: '2026-07-20',
        actualStart: '2026-07-05',
        actualEnd: null,
      });
      const snapshot = buildMonitoringSnapshot({
        period,
        referenceDate, // 2026-08-05
        activities: [act],
        deliverables: [deliverable()],
        comments: [],
        entries: [],
        summary: summary(),
      });
      expect(snapshot.delayedActivities).toHaveLength(1);
      expect(snapshot.delayedActivities[0].status).toBe('em_aberto');
      expect(snapshot.delayedActivities[0].daysLate).toBe(16); // 20/jul -> 05/ago
    });

    it('atividade concluída com atraso (fim real > planejado) entra como concluida_com_atraso', () => {
      const act = activity({
        plannedEnd: '2026-07-10',
        actualStart: '2026-07-01',
        actualEnd: '2026-07-15',
      });
      const snapshot = buildMonitoringSnapshot({
        period,
        referenceDate,
        activities: [act],
        deliverables: [deliverable()],
        comments: [],
        entries: [],
        summary: summary(),
      });
      expect(snapshot.delayedActivities).toHaveLength(1);
      expect(snapshot.delayedActivities[0].status).toBe('concluida_com_atraso');
      expect(snapshot.delayedActivities[0].daysLate).toBe(5);
    });

    it('não marca como atrasada uma atividade não concluída com planejado ainda no futuro', () => {
      const act = activity({
        plannedEnd: '2026-09-01',
        actualStart: '2026-07-05',
        actualEnd: null,
      });
      const snapshot = buildMonitoringSnapshot({
        period,
        referenceDate,
        activities: [act],
        deliverables: [deliverable()],
        comments: [],
        entries: [],
        summary: summary(),
      });
      expect(snapshot.delayedActivities).toHaveLength(0);
    });

    it('não marca atividade concluída dentro do prazo', () => {
      const act = activity({
        plannedEnd: '2026-07-20',
        actualStart: '2026-07-01',
        actualEnd: '2026-07-15',
      });
      const snapshot = buildMonitoringSnapshot({
        period,
        referenceDate,
        activities: [act],
        deliverables: [deliverable()],
        comments: [],
        entries: [],
        summary: summary(),
      });
      expect(snapshot.delayedActivities).toHaveLength(0);
    });

    it('sem planejado definido não pode estar atrasada', () => {
      const act = activity({ plannedEnd: null, actualStart: '2026-07-01', actualEnd: null });
      const snapshot = buildMonitoringSnapshot({
        period,
        referenceDate,
        activities: [act],
        deliverables: [deliverable()],
        comments: [],
        entries: [],
        summary: summary(),
      });
      expect(snapshot.delayedActivities).toHaveLength(0);
    });
  });

  describe('entregas concluídas no período', () => {
    it('marca entrega como concluída quando todas as atividades ativas concluíram dentro do período', () => {
      const acts = [
        activity({ id: 'a1', actualStart: '2026-07-01', actualEnd: '2026-07-10' }),
        activity({ id: 'a2', actualStart: '2026-07-05', actualEnd: '2026-07-20' }),
      ];
      const snapshot = buildMonitoringSnapshot({
        period,
        referenceDate,
        activities: acts,
        deliverables: [deliverable()],
        comments: [],
        entries: [],
        summary: summary(),
      });
      expect(snapshot.concludedDeliverables).toHaveLength(1);
      expect(snapshot.concludedDeliverables[0].concludedAt).toBe('2026-07-20');
    });

    it('não marca entrega quando alguma atividade ativa ainda não concluiu', () => {
      const acts = [
        activity({ id: 'a1', actualStart: '2026-07-01', actualEnd: '2026-07-10' }),
        activity({ id: 'a2', actualStart: '2026-07-05', actualEnd: null }),
      ];
      const snapshot = buildMonitoringSnapshot({
        period,
        referenceDate,
        activities: acts,
        deliverables: [deliverable()],
        comments: [],
        entries: [],
        summary: summary(),
      });
      expect(snapshot.concludedDeliverables).toHaveLength(0);
    });

    it('não marca entrega concluída antes do período (conclusão fora do intervalo)', () => {
      const acts = [
        activity({ id: 'a1', actualStart: '2026-05-01', actualEnd: '2026-05-10' }),
      ];
      const snapshot = buildMonitoringSnapshot({
        period,
        referenceDate,
        activities: acts,
        deliverables: [deliverable()],
        comments: [],
        entries: [],
        summary: summary(),
      });
      expect(snapshot.concludedDeliverables).toHaveLength(0);
    });
  });

  describe('progresso físico antes/depois', () => {
    it('conta concluídas antes do início e até o fim do período, sobre o total ativo', () => {
      const acts = [
        activity({ id: 'a1', actualEnd: '2026-06-15' }), // concluída antes do período
        activity({ id: 'a2', actualEnd: '2026-07-20' }), // concluída durante o período
        activity({ id: 'a3', actualEnd: null }), // ainda não concluída
        activity({ id: 'a4', actualEnd: '2026-07-01', archived: true }), // arquivada, fora da contagem
      ];
      const snapshot = buildMonitoringSnapshot({
        period,
        referenceDate,
        activities: acts,
        deliverables: [deliverable()],
        comments: [],
        entries: [],
        summary: summary(),
      });
      expect(snapshot.physicalProgress.before).toEqual({ concluded: 1, total: 3 });
      expect(snapshot.physicalProgress.after).toEqual({ concluded: 2, total: 3 });
    });
  });

  describe('comentários por atividade', () => {
    function comment(over: Partial<MonitoringCommentInput> = {}): MonitoringCommentInput {
      return {
        activityId: 'act-1',
        author: 'Fulano',
        body: 'Progrediu bem',
        happenedOn: '2026-07-10',
        ...over,
      };
    }

    it('agrupa comentários do período por atividade', () => {
      const acts = [activity({ id: 'a1', name: 'Atividade X' })];
      const comments = [
        comment({ activityId: 'a1', happenedOn: '2026-07-05' }),
        comment({ activityId: 'a1', happenedOn: '2026-07-10', body: 'Outro comentário' }),
      ];
      const snapshot = buildMonitoringSnapshot({
        period,
        referenceDate,
        activities: acts,
        deliverables: [deliverable()],
        comments,
        entries: [],
        summary: summary(),
      });
      expect(snapshot.commentsByActivity).toHaveLength(1);
      expect(snapshot.commentsByActivity[0].activityName).toBe('Atividade X');
      expect(snapshot.commentsByActivity[0].comments).toHaveLength(2);
    });

    it('exclui comentário fora do período', () => {
      const acts = [activity({ id: 'a1' })];
      const comments = [comment({ activityId: 'a1', happenedOn: '2026-06-01' })];
      const snapshot = buildMonitoringSnapshot({
        period,
        referenceDate,
        activities: acts,
        deliverables: [deliverable()],
        comments,
        entries: [],
        summary: summary(),
      });
      expect(snapshot.commentsByActivity).toHaveLength(0);
    });
  });

  describe('financeiro', () => {
    function entry(over: Partial<MonitoringEntryInput> = {}): MonitoringEntryInput {
      return {
        entryDate: '2026-07-15',
        amount: 100,
        kind: 'despesa',
        description: null,
        vendorName: null,
        ...over,
      };
    }

    it('soma só as despesas/manuais dentro do período', () => {
      const entries = [
        entry({ amount: 100, entryDate: '2026-07-01' }),
        entry({ amount: 50, entryDate: '2026-06-30' }), // fora do período
        entry({ amount: 20, kind: 'aporte', entryDate: '2026-07-10' }), // aporte não é gasto
        entry({ amount: 10, kind: 'ignorado', entryDate: '2026-07-10' }),
        entry({ amount: 30, kind: 'manual', entryDate: '2026-07-31' }),
      ];
      const snapshot = buildMonitoringSnapshot({
        period,
        referenceDate,
        activities: [],
        deliverables: [],
        comments: [],
        entries,
        summary: summary(),
      });
      expect(snapshot.financial.periodTotal).toBe(130);
      expect(snapshot.financial.periodEntries).toHaveLength(2);
    });

    it('reaproveita o ProjectSummary para os números acumulados, sem recalcular', () => {
      const s = summary({ realized: 999, transferred: 77 });
      const snapshot = buildMonitoringSnapshot({
        period,
        referenceDate,
        activities: [],
        deliverables: [],
        comments: [],
        entries: [],
        summary: s,
      });
      expect(snapshot.financial.summary).toBe(s);
    });
  });

  describe('atividades do próximo período', () => {
    it('inclui atividades com início planejado na janela seguinte, ainda não iniciadas', () => {
      const acts = [
        activity({ id: 'a1', plannedStart: '2026-08-01', actualStart: null }),
        activity({ id: 'a2', plannedStart: '2026-08-31', actualStart: null }),
        activity({ id: 'a3', plannedStart: '2026-09-01', actualStart: null }), // fora da janela (período tem 31 dias)
        activity({ id: 'a4', plannedStart: '2026-08-05', actualStart: '2026-08-01' }), // já começou
      ];
      const snapshot = buildMonitoringSnapshot({
        period,
        referenceDate,
        activities: acts,
        deliverables: [deliverable()],
        comments: [],
        entries: [],
        summary: summary(),
      });
      const ids = snapshot.upcomingActivities.map((a) => a.id);
      expect(ids).toEqual(['a1', 'a2']);
    });
  });
});

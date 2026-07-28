import { describe, it, expect } from 'vitest';
import {
  detectFindings,
  resolvedFindings,
  isResolutionStale,
  existingFindingFromRow,
  type ExistingFinding,
} from './monitoring-findings';
import type {
  MonitoringSnapshot,
  DelayedActivity,
  InProgressActivity,
  ConcludedActivity,
  ConcludedDeliverableInfo,
} from './monitoring-snapshot';
import type { ProjectSummary } from './budget';
import type { ActivityFindingRow } from '@/lib/supabase/types';

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

const delayedAberto: DelayedActivity = {
  id: 'act-1',
  deliverableName: 'Entrega A',
  name: 'Curso de capacitação',
  responsible: 'Fulano',
  plannedStart: '2026-06-01',
  plannedEnd: '2026-06-20',
  daysLate: 53,
  status: 'em_aberto',
};

const inProgressOverdue: InProgressActivity = {
  id: 'act-2',
  deliverableName: 'Entrega B',
  name: 'Instalação de equipamentos',
  responsible: 'Beltrano',
  actualStart: '2026-06-10',
  plannedStart: '2026-06-10',
  plannedEnd: '2026-06-25',
};

const closingActivity: ConcludedActivity = {
  id: 'act-3',
  deliverableName: 'Entrega C',
  name: 'Entrega final do material',
  responsible: 'Ciclana',
  actualStart: '2026-07-01',
  actualEnd: '2026-07-15',
  plannedStart: '2026-07-01',
  plannedEnd: '2026-07-15',
  overdueDays: 0,
};

const concludedDeliverable: ConcludedDeliverableInfo = {
  id: 'del-3',
  name: 'Entrega C',
  concludedAt: '2026-07-15',
  closingActivityId: 'act-3',
  activityCount: 1,
};

describe('detectFindings', () => {
  it('detecta atividade atrasada sem justificativa como crítico', () => {
    const s = snapshot({ delayedActivities: [delayedAberto] });
    const findings = detectFindings(s, []);
    const f = findings.find((f) => f.activityId === 'act-1' && f.kind === 'sem_justificativa');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('critico');
    expect(f?.description).toContain('53');
    expect(f?.description).toContain('Curso de capacitação');
  });

  it('detecta atividade em andamento além do planejado como crítico', () => {
    const s = snapshot({ inProgressActivities: [inProgressOverdue] });
    const findings = detectFindings(s, []);
    const f = findings.find((f) => f.activityId === 'act-2' && f.kind === 'atraso');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('critico');
    expect(f?.description).toContain('Instalação de equipamentos');
  });

  it('não aponta atividade em andamento cujo planejado ainda não passou', () => {
    const s = snapshot({
      inProgressActivities: [{ ...inProgressOverdue, plannedEnd: '2026-12-31' }],
    });
    const findings = detectFindings(s, []);
    expect(findings.find((f) => f.activityId === 'act-2')).toBeUndefined();
  });

  it('detecta entrega concluída sem comentário como complementar, ancorado na atividade que fechou', () => {
    const s = snapshot({
      concludedActivities: [closingActivity],
      concludedDeliverables: [concludedDeliverable],
    });
    const findings = detectFindings(s, []);
    const f = findings.find((f) => f.kind === 'beneficio');
    expect(f).toBeDefined();
    expect(f?.activityId).toBe('act-3');
    expect(f?.severity).toBe('complementar');
  });

  it('não aponta entrega concluída quando já existe comentário na atividade que fechou', () => {
    const s = snapshot({
      concludedActivities: [closingActivity],
      concludedDeliverables: [concludedDeliverable],
      commentsByActivity: [
        {
          activityId: 'act-3',
          activityName: 'Entrega final do material',
          deliverableName: 'Entrega C',
          comments: [{ author: 'Fulano', body: 'Ótimo resultado, alunos aprovados.', happenedOn: '2026-07-15' }],
        },
      ],
    });
    const findings = detectFindings(s, []);
    expect(findings.find((f) => f.kind === 'beneficio')).toBeUndefined();
  });

  it('filtra apontamento já resolvido e ainda válido (datas planejadas batem)', () => {
    const s = snapshot({ delayedActivities: [delayedAberto] });
    const existing: ExistingFinding[] = [
      {
        activityId: 'act-1',
        kind: 'sem_justificativa',
        resolution: 'justificado',
        note: 'Aguardando material do fornecedor',
        plannedStartAtResolution: '2026-06-01',
        plannedEndAtResolution: '2026-06-20',
        resolvedBy: 'Gestor',
        resolvedAt: '2026-07-20T00:00:00.000Z',
      },
    ];
    const findings = detectFindings(s, existing);
    expect(findings.find((f) => f.activityId === 'act-1' && f.kind === 'sem_justificativa')).toBeUndefined();
  });

  it('EXPIRA a resolução e reabre o apontamento quando a data planejada muda após a resolução (replanejamento no SGF)', () => {
    // O SGF replaneja a atividade: o planejado VIGENTE no snapshot atual
    // (2026-07-10) já não é mais o mesmo que estava valendo quando o gestor
    // resolveu o apontamento (2026-06-20, capturado em
    // `plannedEndAtResolution`). A marcação antiga não pode ser aplicada a um
    // desvio que nem existia quando ela foi feita.
    const replanejada: DelayedActivity = { ...delayedAberto, plannedEnd: '2026-07-10', daysLate: 26 };
    const s = snapshot({ delayedActivities: [replanejada] });
    const existing: ExistingFinding[] = [
      {
        activityId: 'act-1',
        kind: 'sem_justificativa',
        resolution: 'replanejado',
        note: 'Data alterada no SGF',
        plannedStartAtResolution: '2026-06-01',
        plannedEndAtResolution: '2026-06-20',
        resolvedBy: 'Gestor',
        resolvedAt: '2026-06-25T00:00:00.000Z',
      },
    ];
    const findings = detectFindings(s, existing);
    const f = findings.find((f) => f.activityId === 'act-1' && f.kind === 'sem_justificativa');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('critico');
  });

  it('mantém dispensado válido fora da lista, mas reabre se dispensado ficar obsoleto', () => {
    const s = snapshot({ delayedActivities: [delayedAberto] });
    const stillValid: ExistingFinding[] = [
      {
        activityId: 'act-1',
        kind: 'sem_justificativa',
        resolution: 'dispensado',
        note: null,
        plannedStartAtResolution: delayedAberto.plannedStart,
        plannedEndAtResolution: delayedAberto.plannedEnd,
        resolvedBy: 'Gestor',
        resolvedAt: '2026-07-01T00:00:00.000Z',
      },
    ];
    expect(detectFindings(s, stillValid)).toHaveLength(0);

    const stale: ExistingFinding[] = [
      { ...stillValid[0], plannedEndAtResolution: '2026-05-01' },
    ];
    expect(detectFindings(s, stale)).toHaveLength(1);
  });
});

describe('resolvedFindings', () => {
  it('devolve apontamentos resolvidos e ainda válidos, com nota e quem resolveu', () => {
    const s = snapshot({ delayedActivities: [delayedAberto] });
    const existing: ExistingFinding[] = [
      {
        activityId: 'act-1',
        kind: 'sem_justificativa',
        resolution: 'justificado',
        note: 'Fornecedor atrasou a entrega do material',
        plannedStartAtResolution: delayedAberto.plannedStart,
        plannedEndAtResolution: delayedAberto.plannedEnd,
        resolvedBy: 'Gestor',
        resolvedAt: '2026-07-20T00:00:00.000Z',
      },
    ];
    const resolved = resolvedFindings(s, existing);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].resolution).toBe('justificado');
    expect(resolved[0].note).toBe('Fornecedor atrasou a entrega do material');
    expect(resolved[0].resolvedBy).toBe('Gestor');
  });

  it('não devolve apontamento cuja resolução expirou (agora está pendente)', () => {
    const s = snapshot({ delayedActivities: [delayedAberto] });
    const existing: ExistingFinding[] = [
      {
        activityId: 'act-1',
        kind: 'sem_justificativa',
        resolution: 'replanejado',
        note: null,
        plannedStartAtResolution: '2026-01-01',
        plannedEndAtResolution: '2026-01-10',
        resolvedBy: 'Gestor',
        resolvedAt: '2026-01-15T00:00:00.000Z',
      },
    ];
    expect(resolvedFindings(s, existing)).toHaveLength(0);
  });
});

describe('isResolutionStale', () => {
  it('não é obsoleta quando as datas batem', () => {
    const existing: ExistingFinding = {
      activityId: 'act-1',
      kind: 'sem_justificativa',
      resolution: 'justificado',
      note: null,
      plannedStartAtResolution: '2026-06-01',
      plannedEndAtResolution: '2026-06-20',
      resolvedBy: null,
      resolvedAt: null,
    };
    expect(isResolutionStale(existing, { plannedStart: '2026-06-01', plannedEnd: '2026-06-20' })).toBe(false);
  });

  it('é obsoleta quando a data planejada final mudou', () => {
    const existing: ExistingFinding = {
      activityId: 'act-1',
      kind: 'sem_justificativa',
      resolution: 'justificado',
      note: null,
      plannedStartAtResolution: '2026-06-01',
      plannedEndAtResolution: '2026-06-20',
      resolvedBy: null,
      resolvedAt: null,
    };
    expect(isResolutionStale(existing, { plannedStart: '2026-06-01', plannedEnd: '2026-07-10' })).toBe(true);
  });
});

describe('existingFindingFromRow', () => {
  it('mapeia a linha do banco para o tipo de domínio', () => {
    const row: ActivityFindingRow = {
      id: 'f1',
      project_id: 'p1',
      activity_id: 'act-1',
      kind: 'sem_justificativa',
      resolution: 'justificado',
      note: 'texto',
      planned_start_at_resolution: '2026-06-01',
      planned_end_at_resolution: '2026-06-20',
      resolved_by: 'Gestor',
      resolved_at: '2026-07-20T00:00:00.000Z',
      created_at: '2026-07-20T00:00:00.000Z',
      updated_at: '2026-07-20T00:00:00.000Z',
    };
    expect(existingFindingFromRow(row)).toEqual({
      activityId: 'act-1',
      kind: 'sem_justificativa',
      resolution: 'justificado',
      note: 'texto',
      plannedStartAtResolution: '2026-06-01',
      plannedEndAtResolution: '2026-06-20',
      resolvedBy: 'Gestor',
      resolvedAt: '2026-07-20T00:00:00.000Z',
    });
  });
});

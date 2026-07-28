import { describe, it, expect } from 'vitest';
import { reconcilePhysical, type ReconcileContext } from './physical-reconcile';
import type { PhysicalParseResult, ParsedActivity } from './physical-import';

function activity(over: Partial<ParsedActivity> = {}): ParsedActivity {
  return {
    deliverableName: 'Entrega A',
    name: 'Atividade 1',
    responsible: 'Fulano de Tal',
    plannedStart: '2026-03-09',
    plannedEnd: '2026-03-18',
    sgfActualStart: null,
    sgfActualEnd: null,
    sgfStatus: 'Em andamento',
    sgfUpdatedAt: '2026-07-15',
    importKey: 'chave-1',
    sortOrder: 0,
    ...over,
  };
}

function parsed(activities: ParsedActivity[]): PhysicalParseResult {
  return {
    deliverables: [{ name: 'Entrega A', sortOrder: 0, activityCount: activities.length }],
    activities,
    discardedRows: 0,
  };
}

const emptyContext: ReconcileContext = {
  existingDeliverables: [],
  existingActivities: [],
};

describe('reconcilePhysical', () => {
  it('chave ausente do banco: atividade é nova', () => {
    const plan = reconcilePhysical(parsed([activity()]), emptyContext);
    expect(plan.activities).toHaveLength(1);
    expect(plan.activities[0].situation).toBe('novo');
    expect(plan.activities[0].activityId).toBeNull();
    expect(plan.counts.novo).toBe(1);
  });

  it('Farol tem data real, SGF não: pendente de lançamento no SGF', () => {
    const context: ReconcileContext = {
      existingDeliverables: [{ id: 'del-1', name: 'Entrega A', sortOrder: 0 }],
      existingActivities: [
        {
          id: 'act-1',
          importKey: 'chave-1',
          deliverableId: 'del-1',
          deliverableName: 'Entrega A',
          name: 'Atividade 1',
          responsible: 'Fulano de Tal',
          plannedStart: '2026-03-09',
          plannedEnd: '2026-03-18',
          actualStart: '2026-03-10',
          actualEnd: null,
          sortOrder: 0,
        },
      ],
    };
    const plan = reconcilePhysical(parsed([activity({ sgfActualStart: null, sgfActualEnd: null })]), context);
    const a = plan.activities[0];
    expect(a.situation).toBe('pendente_sgf');
    expect(a.actualStart.state).toBe('pendente_sgf');
    expect(a.actualStart.farol).toBe('2026-03-10');
    expect(a.actualStart.sgf).toBeNull();
    // status vem da data real do Farol, não do SGF (que diz "Em andamento" pra tudo)
    expect(a.status).toBe('em_andamento');
    expect(plan.counts.pendente_sgf).toBe(1);
  });

  it('SGF tem data que o Farol não tem: absorve', () => {
    const context: ReconcileContext = {
      existingDeliverables: [{ id: 'del-1', name: 'Entrega A', sortOrder: 0 }],
      existingActivities: [
        {
          id: 'act-1',
          importKey: 'chave-1',
          deliverableId: 'del-1',
          deliverableName: 'Entrega A',
          name: 'Atividade 1',
          responsible: 'Fulano de Tal',
          plannedStart: '2026-03-09',
          plannedEnd: '2026-03-18',
          actualStart: null,
          actualEnd: null,
          sortOrder: 0,
        },
      ],
    };
    const plan = reconcilePhysical(
      parsed([activity({ sgfActualStart: '2026-03-11', sgfActualEnd: null })]),
      context,
    );
    const a = plan.activities[0];
    expect(a.situation).toBe('absorvido');
    expect(a.actualStart.state).toBe('absorvido');
    expect(a.actualStart.farol).toBeNull();
    expect(a.actualStart.sgf).toBe('2026-03-11');
    // status usa o valor absorvido, já que o Farol ainda não tinha nada
    expect(a.status).toBe('em_andamento');
    expect(plan.counts.absorvido).toBe(1);
  });

  it('ambos têm data e ela diverge: surge a divergência, nada é resolvido automaticamente', () => {
    const context: ReconcileContext = {
      existingDeliverables: [{ id: 'del-1', name: 'Entrega A', sortOrder: 0 }],
      existingActivities: [
        {
          id: 'act-1',
          importKey: 'chave-1',
          deliverableId: 'del-1',
          deliverableName: 'Entrega A',
          name: 'Atividade 1',
          responsible: 'Fulano de Tal',
          plannedStart: '2026-03-09',
          plannedEnd: '2026-03-18',
          actualStart: '2026-03-10',
          actualEnd: null,
          sortOrder: 0,
        },
      ],
    };
    const plan = reconcilePhysical(
      parsed([activity({ sgfActualStart: '2026-03-12', sgfActualEnd: null })]),
      context,
    );
    const a = plan.activities[0];
    expect(a.situation).toBe('divergente');
    expect(a.actualStart.state).toBe('divergente');
    expect(a.actualStart.farol).toBe('2026-03-10');
    expect(a.actualStart.sgf).toBe('2026-03-12');
    // a data real do Farol nunca é sobrescrita pelo import — o valor "vigente"
    // pro cálculo de status continua sendo o do Farol.
    expect(a.status).toBe('em_andamento');
    expect(plan.counts.divergente).toBe(1);
  });

  it('ambos têm a mesma data: reconciliado', () => {
    const context: ReconcileContext = {
      existingDeliverables: [{ id: 'del-1', name: 'Entrega A', sortOrder: 0 }],
      existingActivities: [
        {
          id: 'act-1',
          importKey: 'chave-1',
          deliverableId: 'del-1',
          deliverableName: 'Entrega A',
          name: 'Atividade 1',
          responsible: 'Fulano de Tal',
          plannedStart: '2026-03-09',
          plannedEnd: '2026-03-18',
          actualStart: '2026-03-10',
          actualEnd: '2026-03-20',
          sortOrder: 0,
        },
      ],
    };
    const plan = reconcilePhysical(
      parsed([activity({ sgfActualStart: '2026-03-10', sgfActualEnd: '2026-03-20' })]),
      context,
    );
    const a = plan.activities[0];
    expect(a.situation).toBe('reconciliado');
    expect(a.actualStart.state).toBe('reconciliado');
    expect(a.actualEnd.state).toBe('reconciliado');
    // actual_end presente -> concluído, não importa o texto do status do SGF
    expect(a.status).toBe('concluido');
    expect(plan.counts.reconciliado).toBe(1);
  });

  it('chave no banco ausente do arquivo: some do SGF, marcada, nunca apagada', () => {
    const context: ReconcileContext = {
      existingDeliverables: [{ id: 'del-1', name: 'Entrega A', sortOrder: 0 }],
      existingActivities: [
        {
          id: 'act-1',
          importKey: 'chave-sumida',
          deliverableId: 'del-1',
          deliverableName: 'Entrega A',
          name: 'Atividade Sumida',
          responsible: 'Fulano de Tal',
          plannedStart: '2026-01-01',
          plannedEnd: '2026-01-10',
          actualStart: '2026-01-02',
          actualEnd: '2026-01-09',
          sortOrder: 0,
        },
      ],
    };
    // Arquivo atual não traz mais essa atividade (nenhuma linha com essa chave).
    const plan = reconcilePhysical(parsed([]), context);
    expect(plan.activities).toHaveLength(1);
    const a = plan.activities[0];
    expect(a.situation).toBe('sumiu');
    expect(a.activityId).toBe('act-1');
    expect(a.importKey).toBe('chave-sumida');
    // As datas reais continuam visíveis — o registro carrega histórico e comentários.
    expect(a.actualStart.farol).toBe('2026-01-02');
    expect(a.actualEnd.farol).toBe('2026-01-09');
    expect(plan.counts.sumiu).toBe(1);
  });

  it('status é sempre derivado das datas reais do Farol, nunca do status bruto do SGF', () => {
    const context: ReconcileContext = {
      existingDeliverables: [{ id: 'del-1', name: 'Entrega A', sortOrder: 0 }],
      existingActivities: [
        {
          id: 'act-1',
          importKey: 'chave-1',
          deliverableId: 'del-1',
          deliverableName: 'Entrega A',
          name: 'Atividade 1',
          responsible: 'Fulano de Tal',
          plannedStart: '2026-11-01',
          plannedEnd: '2026-11-30',
          actualStart: null,
          actualEnd: null,
          sortOrder: 0,
        },
      ],
    };
    // O SGF classifica como "Em andamento" mesmo para atividade que só começa
    // em novembro — o parser não confia nisso, e a conciliação também não.
    const plan = reconcilePhysical(
      parsed([activity({ sgfStatus: 'Em andamento', sgfActualStart: null, sgfActualEnd: null })]),
      context,
    );
    expect(plan.activities[0].status).toBe('nao_iniciado');
  });

  it('replanejamento muda datas previstas mas preserva as datas reais do Farol e a identidade da atividade', () => {
    const context: ReconcileContext = {
      existingDeliverables: [{ id: 'del-1', name: 'Entrega A', sortOrder: 0 }],
      existingActivities: [
        {
          id: 'act-1',
          importKey: 'chave-1',
          deliverableId: 'del-1',
          deliverableName: 'Entrega A',
          name: 'Atividade 1',
          responsible: 'Fulano de Tal',
          plannedStart: '2026-03-09',
          plannedEnd: '2026-03-18',
          actualStart: '2026-03-10',
          actualEnd: null,
          sortOrder: 0,
        },
      ],
    };
    // Replan: o arquivo novo chega com datas previstas diferentes, mesma chave.
    const plan = reconcilePhysical(
      parsed([
        activity({
          plannedStart: '2026-04-01',
          plannedEnd: '2026-04-30',
          sgfActualStart: null,
          sgfActualEnd: null,
        }),
      ]),
      context,
    );
    const a = plan.activities[0];
    expect(a.activityId).toBe('act-1');
    expect(a.importKey).toBe('chave-1');
    expect(a.plannedStart).toBe('2026-04-01');
    expect(a.plannedEnd).toBe('2026-04-30');
    // Data real do Farol preservada — não foi sobrescrita pelo replan.
    expect(a.actualStart.farol).toBe('2026-03-10');
    expect(a.situation).toBe('pendente_sgf');
  });

  it('entrega nova (nome ausente do banco) fica marcada como nova', () => {
    const plan = reconcilePhysical(parsed([activity()]), emptyContext);
    expect(plan.deliverables).toHaveLength(1);
    expect(plan.deliverables[0].situation).toBe('novo');
    expect(plan.deliverables[0].id).toBeNull();
  });

  it('entrega já existente é reconhecida pelo nome', () => {
    const context: ReconcileContext = {
      existingDeliverables: [{ id: 'del-1', name: 'Entrega A', sortOrder: 0 }],
      existingActivities: [],
    };
    const plan = reconcilePhysical(parsed([activity()]), context);
    expect(plan.deliverables[0].situation).toBe('existente');
    expect(plan.deliverables[0].id).toBe('del-1');
  });
});

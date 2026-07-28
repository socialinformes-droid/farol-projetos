import { describe, it, expect } from 'vitest';
import { buildPhysicalDashboard } from './physical-dashboard';
import type { ActivityRow, DeliverableRow } from '@/lib/supabase/types';

function deliverable(over: Partial<DeliverableRow> = {}): DeliverableRow {
  return {
    id: 'del-1',
    project_id: 'proj-1',
    name: 'Entrega A',
    sort_order: 0,
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function activity(over: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: 'act-1',
    project_id: 'proj-1',
    deliverable_id: 'del-1',
    name: 'Atividade 1',
    responsible: 'Fulano',
    planned_start: '2026-03-01',
    planned_end: '2026-03-10',
    actual_start: null,
    actual_end: null,
    sgf_actual_start: null,
    sgf_actual_end: null,
    sgf_status: 'Em andamento',
    sgf_updated_at: '2026-07-01',
    status: 'nao_iniciado',
    sort_order: 0,
    import_key: 'chave-1',
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

describe('buildPhysicalDashboard', () => {
  it('coloca na fila a atividade com data real do Farol ainda sem par no SGF', () => {
    const dash = buildPhysicalDashboard(
      [deliverable()],
      [activity({ actual_start: '2026-03-05', sgf_actual_start: null })],
    );
    expect(dash.queue).toHaveLength(1);
    expect(dash.queue[0].pendingStart).toBe('2026-03-05');
    expect(dash.queue[0].deliverableName).toBe('Entrega A');
  });

  it('não coloca na fila quando a data já está reconciliada com o SGF', () => {
    const dash = buildPhysicalDashboard(
      [deliverable()],
      [activity({ actual_start: '2026-03-05', sgf_actual_start: '2026-03-05' })],
    );
    expect(dash.queue).toHaveLength(0);
  });

  it('conta execução por atividades concluídas, nunca por percentual do SGF', () => {
    const dash = buildPhysicalDashboard(
      [deliverable()],
      [
        activity({ id: 'a1', status: 'concluido' }),
        activity({ id: 'a2', status: 'em_andamento' }),
        activity({ id: 'a3', status: 'nao_iniciado' }),
      ],
    );
    expect(dash.concluded).toBe(1);
    expect(dash.total).toBe(3);
  });

  it('exclui atividades arquivadas (sumidas do SGF) da fila e da contagem', () => {
    const dash = buildPhysicalDashboard(
      [deliverable()],
      [
        activity({ id: 'a1', status: 'concluido' }),
        activity({
          id: 'a2',
          status: 'em_andamento',
          actual_start: '2026-03-05',
          sgf_actual_start: null,
          archived_at: '2026-07-01T00:00:00Z',
        }),
      ],
    );
    expect(dash.total).toBe(1);
    expect(dash.queue).toHaveLength(0);
  });

  it('calcula progresso por entrega excluindo entregas arquivadas', () => {
    const dash = buildPhysicalDashboard(
      [
        deliverable({ id: 'del-1', name: 'Entrega A' }),
        deliverable({ id: 'del-2', name: 'Entrega Sumida', archived_at: '2026-07-01T00:00:00Z' }),
      ],
      [
        activity({ id: 'a1', deliverable_id: 'del-1', status: 'concluido' }),
        activity({ id: 'a2', deliverable_id: 'del-1', status: 'nao_iniciado' }),
      ],
    );
    expect(dash.deliverableProgress).toHaveLength(1);
    expect(dash.deliverableProgress[0].concluded).toBe(1);
    expect(dash.deliverableProgress[0].total).toBe(2);
  });
});

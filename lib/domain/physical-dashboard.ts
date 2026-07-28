import type { ActivityRow, DeliverableRow } from '@/lib/supabase/types';
import { reconcileDateField } from './physical-reconcile';

export type QueueItem = {
  activity: ActivityRow;
  deliverableName: string;
  /** Data real de início ainda não lançada no SGF, ou null se não pendente. */
  pendingStart: string | null;
  /** Data real de finalização ainda não lançada no SGF, ou null se não pendente. */
  pendingEnd: string | null;
};

export type DeliverableProgress = {
  deliverable: DeliverableRow;
  activities: ActivityRow[];
  concluded: number;
  total: number;
};

export type PhysicalDashboard = {
  queue: QueueItem[];
  concluded: number;
  total: number;
  deliverableProgress: DeliverableProgress[];
};

/**
 * Agrega o cronograma já persistido em (a) fila de pendências de lançamento
 * no SGF, (b) contagem de execução física e (c) progresso por entrega.
 *
 * Atividades arquivadas (sumiram do SGF) ficam de fora de tudo aqui — elas
 * continuam visíveis na tela de cronograma completo, mas não fazem sentido
 * numa fila de "o que ainda falta digitar no SGF" nem no percentual de
 * execução do escopo atual.
 *
 * A pendência é recalculada a cada carregamento a partir das colunas já
 * gravadas (`actual_*` vs `sgf_actual_*`) — não depende de um import ter
 * acabado de rodar, porque uma data real pode ter sido só agora registrada
 * direto na tela de entregas.
 */
export function buildPhysicalDashboard(
  deliverables: DeliverableRow[],
  activities: ActivityRow[],
): PhysicalDashboard {
  const deliverableNameById = new Map(deliverables.map((d) => [d.id, d.name]));
  const active = activities.filter((a) => a.archived_at === null);

  const queue: QueueItem[] = [];
  for (const a of active) {
    const startField = reconcileDateField(a.actual_start, a.sgf_actual_start);
    const endField = reconcileDateField(a.actual_end, a.sgf_actual_end);
    const pendingStart = startField.state === 'pendente_sgf' ? a.actual_start : null;
    const pendingEnd = endField.state === 'pendente_sgf' ? a.actual_end : null;

    if (pendingStart || pendingEnd) {
      queue.push({
        activity: a,
        deliverableName: deliverableNameById.get(a.deliverable_id) ?? '—',
        pendingStart,
        pendingEnd,
      });
    }
  }

  const concluded = active.filter((a) => a.status === 'concluido').length;

  const deliverableProgress: DeliverableProgress[] = deliverables
    .filter((d) => d.archived_at === null)
    .map((d) => {
      const acts = active.filter((a) => a.deliverable_id === d.id);
      return {
        deliverable: d,
        activities: acts,
        concluded: acts.filter((a) => a.status === 'concluido').length,
        total: acts.length,
      };
    });

  return { queue, concluded, total: active.length, deliverableProgress };
}

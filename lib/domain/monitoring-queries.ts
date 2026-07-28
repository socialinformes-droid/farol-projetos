import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MonitoringRow } from '@/lib/supabase/types';
import { loadProjectSummary } from './project-queries';
import { loadPhysicalSchedule } from './physical-queries';
import {
  buildMonitoringSnapshot,
  type MonitoringSnapshot,
  type MonitoringPeriod,
  type MonitoringActivityInput,
  type MonitoringDeliverableInput,
  type MonitoringCommentInput,
  type MonitoringEntryInput,
} from './monitoring-snapshot';

/** Lista os monitoramentos de um projeto, do período mais recente para o mais antigo. */
export async function listMonitorings(projectId: string): Promise<MonitoringRow[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('monitorings')
    .select('*')
    .eq('project_id', projectId)
    .order('period_end', { ascending: false });
  return data ?? [];
}

export async function loadMonitoring(id: string): Promise<MonitoringRow | null> {
  const supabase = createAdminClient();
  const { data } = await supabase.from('monitorings').select('*').eq('id', id).maybeSingle();
  return data ?? null;
}

/**
 * Carrega tudo que o snapshot precisa (resumo financeiro, cronograma físico
 * completo e o razão do período) e monta o registro factual do período.
 * `null` quando o projeto não existe.
 */
export async function buildProjectMonitoringSnapshot(
  projectId: string,
  period: MonitoringPeriod,
  referenceDate: string,
): Promise<MonitoringSnapshot | null> {
  const supabase = createAdminClient();

  const [summaryResult, schedule, entriesResult] = await Promise.all([
    loadProjectSummary(projectId),
    loadPhysicalSchedule(projectId),
    supabase
      .from('ledger_entries')
      .select('entry_date, amount, kind, description, vendor_name')
      .eq('project_id', projectId),
  ]);

  if (!summaryResult) return null;

  const deliverableNameById = new Map(schedule.deliverables.map((d) => [d.id, d.name]));

  const activities: MonitoringActivityInput[] = schedule.activities.map((a) => ({
    id: a.id,
    deliverableId: a.deliverable_id,
    deliverableName: deliverableNameById.get(a.deliverable_id) ?? '—',
    name: a.name,
    responsible: a.responsible,
    plannedStart: a.planned_start,
    plannedEnd: a.planned_end,
    actualStart: a.actual_start,
    actualEnd: a.actual_end,
    archived: a.archived_at !== null,
  }));

  const deliverables: MonitoringDeliverableInput[] = schedule.deliverables.map((d) => ({
    id: d.id,
    name: d.name,
    archived: d.archived_at !== null,
  }));

  const comments: MonitoringCommentInput[] = schedule.comments.map((c) => ({
    activityId: c.activity_id,
    author: c.author,
    body: c.body,
    happenedOn: c.happened_on,
  }));

  const entries: MonitoringEntryInput[] = (entriesResult.data ?? []).map((e) => ({
    entryDate: e.entry_date,
    amount: Number(e.amount),
    kind: e.kind,
    description: e.description,
    vendorName: e.vendor_name,
  }));

  return buildMonitoringSnapshot({
    period,
    referenceDate,
    activities,
    deliverables,
    comments,
    entries,
    summary: summaryResult.summary,
  });
}

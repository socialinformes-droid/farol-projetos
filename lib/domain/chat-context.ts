import type { ActivityRow, DeliverableRow, LedgerEntryRow, ProjectRow } from '@/lib/supabase/types';
import type { ProjectSummary } from './budget';
import type { PhysicalDashboard } from './physical-dashboard';

/**
 * Contexto que o chat lateral (`/api/chat`) recebe sobre um projeto — um
 * retrato do estado ATUAL, nunca o histórico completo. Montado no servidor
 * (a página do projeto já carregou tudo isso para o dashboard) e passado ao
 * Client Component como prop; o chat nunca consulta o Supabase.
 *
 * Deliberadamente limitado: `delayedActivities` e `recentEntries` são sempre
 * cortados às primeiras N entradas — o tamanho do contexto não cresce com a
 * idade do projeto, então uma conversa sobre um projeto com três anos de
 * lançamentos custa o mesmo que um projeto novo.
 */

export type ChatDelayedActivity = {
  deliverableName: string;
  activityName: string;
  daysLate: number;
};

export type ChatRecentEntry = {
  date: string;
  amount: number;
  description: string | null;
  vendorName: string | null;
};

export type ProjectChatContext = {
  projectName: string;
  projectCode: string;
  sgfNumber: string | null;
  managerName: string | null;
  fundingModel: string;
  budgetControl: string;
  totalBudget: number;
  realized: number;
  available: number;
  executionPct: number;
  transferred: number;
  transferCap: number;
  capUsagePct: number;
  deliverableCount: number;
  activityCount: number;
  concludedActivityCount: number;
  physicalProgressPct: number;
  delayedActivities: ChatDelayedActivity[];
  recentEntries: ChatRecentEntry[];
};

export const MAX_DELAYED_ACTIVITIES = 8;
export const MAX_RECENT_ENTRIES = 8;

function toEpochDays(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function diffDays(a: string, b: string): number {
  return toEpochDays(a) - toEpochDays(b);
}

export function buildProjectChatContext(args: {
  project: ProjectRow;
  summary: ProjectSummary;
  physical: PhysicalDashboard;
  activities: ActivityRow[];
  deliverables: DeliverableRow[];
  recentEntries: LedgerEntryRow[];
  referenceDate: string;
}): ProjectChatContext {
  const { project, summary, physical, activities, deliverables, recentEntries, referenceDate } = args;

  const deliverableNameById = new Map(deliverables.map((d) => [d.id, d.name]));

  const delayedActivities: ChatDelayedActivity[] = activities
    .filter(
      (a) =>
        a.archived_at === null &&
        a.actual_end === null &&
        a.planned_end !== null &&
        a.planned_end < referenceDate,
    )
    .map((a) => ({
      deliverableName: deliverableNameById.get(a.deliverable_id) ?? '—',
      activityName: a.name,
      daysLate: diffDays(referenceDate, a.planned_end as string),
    }))
    .sort((a, b) => b.daysLate - a.daysLate)
    .slice(0, MAX_DELAYED_ACTIVITIES);

  const sampledEntries: ChatRecentEntry[] = recentEntries.slice(0, MAX_RECENT_ENTRIES).map((e) => ({
    date: e.entry_date,
    amount: Number(e.amount),
    description: e.description,
    vendorName: e.vendor_name,
  }));

  return {
    projectName: project.name,
    projectCode: project.code,
    sgfNumber: project.sgf_number,
    managerName: project.manager_name,
    fundingModel: project.funding_model,
    budgetControl: project.budget_control,
    totalBudget: summary.totalBudget,
    realized: summary.realized,
    available: summary.available,
    executionPct: summary.executionPct,
    transferred: summary.transferred,
    transferCap: summary.transferCap,
    capUsagePct: summary.capUsagePct,
    deliverableCount: deliverables.filter((d) => d.archived_at === null).length,
    activityCount: physical.total,
    concludedActivityCount: physical.concluded,
    physicalProgressPct:
      physical.total > 0 ? Math.round((physical.concluded / physical.total) * 1000) / 10 : 0,
    delayedActivities,
    recentEntries: sampledEntries,
  };
}

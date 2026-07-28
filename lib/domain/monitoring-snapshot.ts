import type { EntryKind } from '@/lib/supabase/types';
import type { ProjectSummary } from './budget';

/**
 * Coleta o registro factual de um período para o monitoramento do PMO
 * DR/AL — módulo puro, sem Supabase. Recebe dados já carregados e devolve
 * uma estrutura tipada; funciona com ou sem IA, porque a IA (`monitoring-prompt`
 * / `monitoring-render`) só consome o que este arquivo já calculou.
 *
 * Datas são sempre strings 'YYYY-MM-DD'. Como o formato tem largura fixa,
 * comparação lexicográfica (`<=`, `>=`) já compara datas corretamente — só a
 * aritmética de dias (atraso, janela do próximo período) precisa converter
 * para "dias desde a época".
 */

export type MonitoringPeriod = { start: string; end: string };

export type MonitoringActivityInput = {
  id: string;
  deliverableId: string;
  deliverableName: string;
  name: string;
  responsible: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  archived: boolean;
};

export type MonitoringDeliverableInput = {
  id: string;
  name: string;
  archived: boolean;
};

export type MonitoringCommentInput = {
  activityId: string;
  author: string | null;
  body: string;
  happenedOn: string;
};

export type MonitoringEntryInput = {
  entryDate: string;
  amount: number;
  kind: EntryKind;
  description: string | null;
  vendorName: string | null;
};

export type ConcludedActivity = {
  id: string;
  deliverableName: string;
  name: string;
  responsible: string | null;
  actualStart: string | null;
  actualEnd: string;
  plannedEnd: string | null;
  /** max(0, real − planejado), em dias. Zero quando não há planejado ou não houve atraso. */
  overdueDays: number;
};

export type InProgressActivity = {
  id: string;
  deliverableName: string;
  name: string;
  responsible: string | null;
  actualStart: string;
  plannedEnd: string | null;
};

export type DelayedActivity = {
  id: string;
  deliverableName: string;
  name: string;
  responsible: string | null;
  plannedEnd: string;
  /** Dias de atraso: contra a data de referência (em_aberto) ou contra a
   * conclusão real (concluida_com_atraso). */
  daysLate: number;
  status: 'em_aberto' | 'concluida_com_atraso';
};

export type ConcludedDeliverableInfo = {
  id: string;
  name: string;
  /** Data da última atividade concluída — o que "fechou" a entrega. */
  concludedAt: string;
  activityCount: number;
};

export type ActivityCommentsGroup = {
  activityId: string;
  activityName: string;
  deliverableName: string;
  comments: { author: string | null; body: string; happenedOn: string }[];
};

export type UpcomingActivity = {
  id: string;
  deliverableName: string;
  name: string;
  responsible: string | null;
  plannedStart: string;
};

export type PhysicalProgressPoint = { concluded: number; total: number };

export type FinancialSnapshot = {
  /** Só despesa/manual dentro do período — aporte não é gasto, ignorado não conta. */
  periodEntries: MonitoringEntryInput[];
  periodTotal: number;
  /** Acumulado, remanejamento e teto vêm prontos daqui — nunca recalculados. */
  summary: ProjectSummary;
};

export type MonitoringSnapshot = {
  period: MonitoringPeriod;
  referenceDate: string;
  /** Janela seguinte ao período (mesma duração), usada para as atividades de "próximos passos". */
  nextPeriod: MonitoringPeriod;
  concludedActivities: ConcludedActivity[];
  inProgressActivities: InProgressActivity[];
  delayedActivities: DelayedActivity[];
  concludedDeliverables: ConcludedDeliverableInfo[];
  physicalProgress: { before: PhysicalProgressPoint; after: PhysicalProgressPoint };
  commentsByActivity: ActivityCommentsGroup[];
  financial: FinancialSnapshot;
  upcomingActivities: UpcomingActivity[];
};

/** Converte 'YYYY-MM-DD' em dias desde a época, em UTC — imune a fuso horário. */
function toEpochDays(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** a − b, em dias. */
function diffDays(a: string, b: string): number {
  return toEpochDays(a) - toEpochDays(b);
}

function addDays(iso: string, days: number): string {
  const epoch = toEpochDays(iso) + days;
  const d = new Date(epoch * 86_400_000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const EXECUTED_KINDS: EntryKind[] = ['despesa', 'manual'];

export function buildMonitoringSnapshot(args: {
  period: MonitoringPeriod;
  /** Data de "agora" para calcular atraso em aberto — explícita para ser testável. */
  referenceDate: string;
  activities: MonitoringActivityInput[];
  deliverables: MonitoringDeliverableInput[];
  comments: MonitoringCommentInput[];
  entries: MonitoringEntryInput[];
  summary: ProjectSummary;
}): MonitoringSnapshot {
  const { period, referenceDate, comments, entries, summary } = args;
  const activities = args.activities.filter((a) => !a.archived);
  const deliverables = args.deliverables.filter((d) => !d.archived);

  const concludedActivities: ConcludedActivity[] = [];
  const inProgressActivities: InProgressActivity[] = [];
  const delayedActivities: DelayedActivity[] = [];

  let beforeConcluded = 0;
  let afterConcluded = 0;

  for (const a of activities) {
    if (a.actualEnd !== null && a.actualEnd < period.start) beforeConcluded += 1;
    if (a.actualEnd !== null && a.actualEnd <= period.end) afterConcluded += 1;

    const concludedInPeriod =
      a.actualEnd !== null && a.actualEnd >= period.start && a.actualEnd <= period.end;

    if (concludedInPeriod) {
      const actualEnd = a.actualEnd as string;
      const overdueDays =
        a.plannedEnd !== null && actualEnd > a.plannedEnd ? diffDays(actualEnd, a.plannedEnd) : 0;
      concludedActivities.push({
        id: a.id,
        deliverableName: a.deliverableName,
        name: a.name,
        responsible: a.responsible,
        actualStart: a.actualStart,
        actualEnd,
        plannedEnd: a.plannedEnd,
        overdueDays,
      });
      if (overdueDays > 0) {
        delayedActivities.push({
          id: a.id,
          deliverableName: a.deliverableName,
          name: a.name,
          responsible: a.responsible,
          plannedEnd: a.plannedEnd as string,
          daysLate: overdueDays,
          status: 'concluida_com_atraso',
        });
      }
      continue;
    }

    if (a.actualStart !== null && a.actualStart <= period.end && a.actualEnd === null) {
      inProgressActivities.push({
        id: a.id,
        deliverableName: a.deliverableName,
        name: a.name,
        responsible: a.responsible,
        actualStart: a.actualStart,
        plannedEnd: a.plannedEnd,
      });
    }

    if (a.actualEnd === null && a.plannedEnd !== null && a.plannedEnd < referenceDate) {
      delayedActivities.push({
        id: a.id,
        deliverableName: a.deliverableName,
        name: a.name,
        responsible: a.responsible,
        plannedEnd: a.plannedEnd,
        daysLate: diffDays(referenceDate, a.plannedEnd),
        status: 'em_aberto',
      });
    }
  }

  const activitiesByDeliverable = new Map<string, MonitoringActivityInput[]>();
  for (const a of activities) {
    const bucket = activitiesByDeliverable.get(a.deliverableId) ?? [];
    bucket.push(a);
    activitiesByDeliverable.set(a.deliverableId, bucket);
  }

  const concludedDeliverables: ConcludedDeliverableInfo[] = [];
  for (const d of deliverables) {
    const acts = activitiesByDeliverable.get(d.id) ?? [];
    if (acts.length === 0) continue;
    if (!acts.every((a) => a.actualEnd !== null)) continue;

    const lastConcludedAt = acts.reduce(
      (max, a) => (a.actualEnd! > max ? a.actualEnd! : max),
      acts[0].actualEnd!,
    );
    if (lastConcludedAt < period.start || lastConcludedAt > period.end) continue;

    concludedDeliverables.push({
      id: d.id,
      name: d.name,
      concludedAt: lastConcludedAt,
      activityCount: acts.length,
    });
  }

  const commentsByActivityMap = new Map<string, ActivityCommentsGroup>();
  const activityById = new Map(activities.map((a) => [a.id, a]));
  for (const c of comments) {
    if (c.happenedOn < period.start || c.happenedOn > period.end) continue;
    const act = activityById.get(c.activityId);
    if (!act) continue;

    const existing = commentsByActivityMap.get(c.activityId);
    if (existing) {
      existing.comments.push({ author: c.author, body: c.body, happenedOn: c.happenedOn });
    } else {
      commentsByActivityMap.set(c.activityId, {
        activityId: c.activityId,
        activityName: act.name,
        deliverableName: act.deliverableName,
        comments: [{ author: c.author, body: c.body, happenedOn: c.happenedOn }],
      });
    }
  }

  const periodEntries = entries.filter(
    (e) => EXECUTED_KINDS.includes(e.kind) && e.entryDate >= period.start && e.entryDate <= period.end,
  );
  const periodTotal = periodEntries.reduce((acc, e) => acc + e.amount, 0);

  const nextStart = addDays(period.end, 1);
  const periodLengthDays = diffDays(period.end, period.start) + 1;
  const nextEnd = addDays(nextStart, periodLengthDays - 1);

  const upcomingActivities: UpcomingActivity[] = activities
    .filter(
      (a) =>
        a.actualStart === null &&
        a.plannedStart !== null &&
        a.plannedStart >= nextStart &&
        a.plannedStart <= nextEnd,
    )
    .map((a) => ({
      id: a.id,
      deliverableName: a.deliverableName,
      name: a.name,
      responsible: a.responsible,
      plannedStart: a.plannedStart as string,
    }));

  return {
    period,
    referenceDate,
    nextPeriod: { start: nextStart, end: nextEnd },
    concludedActivities,
    inProgressActivities,
    delayedActivities,
    concludedDeliverables,
    physicalProgress: {
      before: { concluded: beforeConcluded, total: activities.length },
      after: { concluded: afterConcluded, total: activities.length },
    },
    commentsByActivity: Array.from(commentsByActivityMap.values()),
    financial: { periodEntries, periodTotal, summary },
    upcomingActivities,
  };
}

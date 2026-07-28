import { notFound } from 'next/navigation';
import { loadProjectSummary, loadRecentLedgerEntries } from '@/lib/domain/project-queries';
import { loadPhysicalSchedule } from '@/lib/domain/physical-queries';
import { buildPhysicalDashboard } from '@/lib/domain/physical-dashboard';
import { listMonitorings } from '@/lib/domain/monitoring-queries';
import { buildProjectChatContext } from '@/lib/domain/chat-context';
import { toISODate } from '@/lib/format';
import { ProjectOverviewView } from './_view';

export const dynamic = 'force-dynamic';

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await loadProjectSummary(id);
  if (!result) notFound();

  const schedule = await loadPhysicalSchedule(id);
  const physical = buildPhysicalDashboard(schedule.deliverables, schedule.activities);
  const monitorings = await listMonitorings(id);
  const recentEntries = await loadRecentLedgerEntries(id, 8);

  const chatContext = buildProjectChatContext({
    project: result.project,
    summary: result.summary,
    physical,
    activities: schedule.activities,
    deliverables: schedule.deliverables,
    recentEntries,
    referenceDate: toISODate(new Date()),
  });

  return (
    <ProjectOverviewView
      project={result.project}
      summary={result.summary}
      physical={physical}
      hasPhysicalData={schedule.deliverables.length > 0}
      latestMonitoring={monitorings[0] ?? null}
      chatContext={chatContext}
    />
  );
}

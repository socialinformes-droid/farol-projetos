import { notFound } from 'next/navigation';
import { loadProjectSummary } from '@/lib/domain/project-queries';
import { loadPhysicalSchedule } from '@/lib/domain/physical-queries';
import { buildPhysicalDashboard } from '@/lib/domain/physical-dashboard';
import { listMonitorings } from '@/lib/domain/monitoring-queries';
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

  return (
    <ProjectOverviewView
      project={result.project}
      summary={result.summary}
      physical={physical}
      hasPhysicalData={schedule.deliverables.length > 0}
      latestMonitoring={monitorings[0] ?? null}
    />
  );
}

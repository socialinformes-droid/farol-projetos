import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  loadMonitoring,
  loadActivityFindings,
  buildProjectMonitoringSnapshot,
} from '@/lib/domain/monitoring-queries';
import { detectFindings, existingFindingFromRow } from '@/lib/domain/monitoring-findings';
import { toISODate } from '@/lib/format';
import { MonitoramentoDetalheView } from './_view';

export const dynamic = 'force-dynamic';

export default async function MonitoramentoDetalhePage({
  params,
}: {
  params: Promise<{ id: string; monitoringId: string }>;
}) {
  const { id, monitoringId } = await params;

  const supabase = createAdminClient();
  const { data: project } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
  if (!project) notFound();

  const monitoring = await loadMonitoring(monitoringId);
  if (!monitoring || monitoring.project_id !== id) notFound();

  // Só para o selo de pendências críticas no botão "Análise" — a tela de
  // análise em si recalcula tudo de novo, esta contagem é só um indicador.
  const snapshot = await buildProjectMonitoringSnapshot(
    id,
    { start: monitoring.period_start, end: monitoring.period_end },
    toISODate(new Date()),
  );
  const findingRows = snapshot ? await loadActivityFindings(id) : [];
  const pendingCriticalCount = snapshot
    ? detectFindings(snapshot, findingRows.map(existingFindingFromRow)).filter(
        (f) => f.severity === 'critico',
      ).length
    : 0;

  return (
    <MonitoramentoDetalheView
      project={project}
      monitoring={monitoring}
      pendingCriticalCount={pendingCriticalCount}
    />
  );
}

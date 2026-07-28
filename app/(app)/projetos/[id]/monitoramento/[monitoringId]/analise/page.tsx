import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  loadMonitoring,
  loadActivityFindings,
  buildProjectMonitoringSnapshot,
} from '@/lib/domain/monitoring-queries';
import { detectFindings, resolvedFindings, existingFindingFromRow } from '@/lib/domain/monitoring-findings';
import { toISODate } from '@/lib/format';
import { AnaliseView } from './_view';

export const dynamic = 'force-dynamic';

/**
 * Tela de análise: mostra os apontamentos pendentes (críticos e
 * complementares) para o gestor resolver antes de gerar com IA, e os já
 * resolvidos, com opção de reabrir. O snapshot é recalculado na hora (data
 * de referência = hoje), igual à rota de geração — nunca reaproveita o
 * snapshot já salvo no monitoramento, que pode estar desatualizado.
 */
export default async function AnaliseMonitoramentoPage({
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

  const snapshot = await buildProjectMonitoringSnapshot(
    id,
    { start: monitoring.period_start, end: monitoring.period_end },
    toISODate(new Date()),
  );
  if (!snapshot) notFound();

  const findingRows = await loadActivityFindings(id);
  const existing = findingRows.map(existingFindingFromRow);

  const pending = detectFindings(snapshot, existing);
  const resolved = resolvedFindings(snapshot, existing);

  return <AnaliseView project={project} monitoring={monitoring} pending={pending} resolved={resolved} />;
}

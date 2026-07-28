import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadMonitoring } from '@/lib/domain/monitoring-queries';
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

  return <MonitoramentoDetalheView project={project} monitoring={monitoring} />;
}

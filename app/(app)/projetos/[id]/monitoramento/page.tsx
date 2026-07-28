import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { listMonitorings } from '@/lib/domain/monitoring-queries';
import { MonitoramentoListView } from './_view';

export const dynamic = 'force-dynamic';

export default async function MonitoramentoListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data: project } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();

  if (!project) notFound();

  const monitorings = await listMonitorings(id);

  return <MonitoramentoListView project={project} monitorings={monitorings} />;
}

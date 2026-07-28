import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadPhysicalSchedule } from '@/lib/domain/physical-queries';
import { EntregasView } from './_view';

export const dynamic = 'force-dynamic';

export default async function EntregasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data: project } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();

  if (!project) notFound();

  const schedule = await loadPhysicalSchedule(id);

  return <EntregasView project={project} schedule={schedule} />;
}

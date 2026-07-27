import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { ImportarView } from './_view';

export const dynamic = 'force-dynamic';

export default async function ImportarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: project }, { data: batches }] = await Promise.all([
    supabase.from('projects').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('import_batches')
      .select('*')
      .eq('project_id', id)
      .order('imported_at', { ascending: false })
      .limit(20),
  ]);

  if (!project) notFound();

  return <ImportarView project={project} batches={batches ?? []} />;
}

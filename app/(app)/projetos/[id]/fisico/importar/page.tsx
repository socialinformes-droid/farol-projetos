import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { ImportarFisicoView } from './_view';

export const dynamic = 'force-dynamic';

export default async function ImportarFisicoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data: project } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();

  if (!project) notFound();

  return <ImportarFisicoView project={project} />;
}

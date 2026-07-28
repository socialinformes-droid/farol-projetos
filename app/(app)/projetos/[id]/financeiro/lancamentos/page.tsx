import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { LancamentosView } from './_view';

export const dynamic = 'force-dynamic';

export default async function LancamentosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ rubrica?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = createAdminClient();

  const [{ data: project }, { data: lines }, { data: entries }] = await Promise.all([
    supabase.from('projects').select('*').eq('id', id).maybeSingle(),
    supabase.from('budget_lines').select('*').eq('project_id', id),
    supabase
      .from('ledger_entries')
      .select('*')
      .eq('project_id', id)
      .order('entry_date', { ascending: false }),
  ]);

  if (!project) notFound();

  return (
    <LancamentosView
      project={project}
      lines={lines ?? []}
      entries={entries ?? []}
      initialUnclassifiedOnly={sp.rubrica === 'sem'}
    />
  );
}

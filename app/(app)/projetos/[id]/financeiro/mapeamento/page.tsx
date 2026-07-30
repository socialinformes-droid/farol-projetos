import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { MapeamentoView } from './_view';

export const dynamic = 'force-dynamic';

export default async function MapeamentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: project }, { data: budgetLines }, { data: mappings }] = await Promise.all([
    supabase.from('projects').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('budget_lines')
      .select('id, code, name')
      .eq('project_id', id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('budget_line_account_mappings')
      .select('id, account_code, account_name, budget_line_id')
      .eq('project_id', id)
      .order('account_code', { ascending: true }),
  ]);

  if (!project) notFound();

  return (
    <MapeamentoView
      project={project}
      budgetLines={budgetLines ?? []}
      mappings={mappings ?? []}
    />
  );
}

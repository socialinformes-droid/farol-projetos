import { notFound } from 'next/navigation';
import { loadProjectSummary } from '@/lib/domain/project-queries';
import { BudgetLinesView } from './_view';

export const dynamic = 'force-dynamic';

export default async function BudgetLinesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await loadProjectSummary(id);
  if (!result) notFound();
  return <BudgetLinesView project={result.project} summary={result.summary} />;
}

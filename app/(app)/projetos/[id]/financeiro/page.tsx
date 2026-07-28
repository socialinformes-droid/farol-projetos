import { notFound } from 'next/navigation';
import { loadProjectSummary } from '@/lib/domain/project-queries';
import { FinanceiroView } from './_view';

export const dynamic = 'force-dynamic';

export default async function FinanceiroPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await loadProjectSummary(id);
  if (!result) notFound();
  return <FinanceiroView project={result.project} summary={result.summary} />;
}

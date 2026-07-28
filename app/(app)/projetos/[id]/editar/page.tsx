import { notFound } from 'next/navigation';

import { ProjectForm } from '@/components/forms/project-form';
import { updateProject } from '@/lib/actions/projects';
import { loadProjectSummary } from '@/lib/domain/project-queries';
import { BackLink } from '@/components/layout/back-link';
import { DeleteProjectDialog } from './delete-project-dialog';

export const dynamic = 'force-dynamic';

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await loadProjectSummary(id);
  if (!result) notFound();

  const { project } = result;
  const boundUpdateProject = updateProject.bind(null, id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href={`/projetos/${id}`} label={project.name} />
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl">Editar projeto</h1>
          <DeleteProjectDialog projectId={project.id} projectName={project.name} />
        </div>
      </div>
      <ProjectForm
        defaultValues={{
          code: project.code,
          name: project.name,
          totalBudget: Number(project.total_budget),
          startDate: project.start_date,
          endDate: project.end_date,
          status: project.status,
          fundingModel: project.funding_model ?? 'interno',
          transferLimitPct: Number(project.transfer_limit_pct),
          warningThresholdPct: Number(project.warning_threshold_pct),
          notes: project.notes,
        }}
        onSubmit={boundUpdateProject}
        submitLabel="Salvar alterações"
      />
    </div>
  );
}

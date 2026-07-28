import { ProjectForm } from '@/components/forms/project-form';
import { createProject } from '@/lib/actions/projects';
import { loadSettings } from '@/lib/actions/settings';
import { BackLink } from '@/components/layout/back-link';

export const dynamic = 'force-dynamic';

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; name?: string }>;
}) {
  const [params, settings] = await Promise.all([searchParams, loadSettings()]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href="/" label="Projetos" />
        <h1 className="font-display text-2xl">Novo projeto</h1>
      </div>
      <ProjectForm
        defaultValues={{ code: params.code, name: params.name }}
        defaults={{
          transferLimitPct: settings.defaultTransferLimitPct,
          warningThresholdPct: settings.defaultWarningThresholdPct,
        }}
        onSubmit={createProject}
        submitLabel="Criar projeto"
      />
    </div>
  );
}

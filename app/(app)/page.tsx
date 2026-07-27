import { listProjectsWithSummary } from '@/lib/domain/project-queries';
import { ProjectsView } from './_view';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const projects = await listProjectsWithSummary();
  return <ProjectsView projects={projects} />;
}

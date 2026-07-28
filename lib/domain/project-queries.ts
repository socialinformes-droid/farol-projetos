import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ProjectRow, BudgetLineRow, LedgerEntryRow } from '@/lib/supabase/types';
import {
  summarizeProject,
  toProjectInput,
  toLineInput,
  toEntryInput,
  type ProjectSummary,
} from './budget';

export type ProjectWithSummary = {
  project: ProjectRow;
  summary: ProjectSummary;
};

/** Uma linha da lista de projetos: só o necessário para o card. */
export async function listProjectsWithSummary(): Promise<ProjectWithSummary[]> {
  const supabase = createAdminClient();

  const [{ data: projects }, { data: lines }, { data: entries }] = await Promise.all([
    supabase.from('projects').select('*').order('created_at', { ascending: false }),
    supabase.from('budget_lines').select('*'),
    supabase.from('ledger_entries').select('project_id, budget_line_id, amount, kind'),
  ]);

  const linesByProject = new Map<string, BudgetLineRow[]>();
  for (const l of lines ?? []) {
    const bucket = linesByProject.get(l.project_id) ?? [];
    bucket.push(l);
    linesByProject.set(l.project_id, bucket);
  }

  const entriesByProject = new Map<string, Pick<LedgerEntryRow, 'project_id' | 'budget_line_id' | 'amount' | 'kind'>[]>();
  for (const e of entries ?? []) {
    const bucket = entriesByProject.get(e.project_id) ?? [];
    bucket.push(e);
    entriesByProject.set(e.project_id, bucket);
  }

  return (projects ?? []).map((project) => ({
    project,
    summary: summarizeProject(
      toProjectInput(project),
      (linesByProject.get(project.id) ?? []).map(toLineInput),
      (entriesByProject.get(project.id) ?? []).map((e) =>
        toEntryInput(e as LedgerEntryRow),
      ),
    ),
  }));
}

export async function loadProjectSummary(
  projectId: string,
): Promise<ProjectWithSummary | null> {
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle();

  if (!project) return null;

  const [{ data: lines }, { data: entries }] = await Promise.all([
    supabase.from('budget_lines').select('*').eq('project_id', projectId),
    supabase
      .from('ledger_entries')
      .select('project_id, budget_line_id, amount, kind')
      .eq('project_id', projectId),
  ]);

  return {
    project,
    summary: summarizeProject(
      toProjectInput(project),
      (lines ?? []).map(toLineInput),
      ((entries ?? []) as LedgerEntryRow[]).map(toEntryInput),
    ),
  };
}

/**
 * Amostra limitada dos lançamentos mais recentes de um projeto — usada só
 * pelo contexto do chat lateral (`lib/domain/chat-context.ts`). Deliberadamente
 * não é "todo o razão": o contexto do chat não pode crescer com o histórico
 * do projeto.
 */
export async function loadRecentLedgerEntries(
  projectId: string,
  limit: number,
): Promise<LedgerEntryRow[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('ledger_entries')
    .select('*')
    .eq('project_id', projectId)
    .order('entry_date', { ascending: false })
    .limit(limit);
  return data ?? [];
}

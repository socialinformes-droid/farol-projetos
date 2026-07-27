'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ActionResult } from './project-schema';
import { budgetLineFormSchema, type BudgetLineFormValues } from './budget-line-schema';

export async function createBudgetLine(
  projectId: string,
  input: BudgetLineFormValues,
): Promise<ActionResult<{ id: string }>> {
  const parsed = budgetLineFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('budget_lines')
    .insert({
      project_id: projectId,
      parent_id: parsed.data.parentId,
      code: parsed.data.code === '' ? null : parsed.data.code,
      name: parsed.data.name,
      budgeted_amount:
        parsed.data.budgetedAmount === null ? null : parsed.data.budgetedAmount.toFixed(2),
      sort_order: parsed.data.sortOrder,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'Já existe uma rubrica com esse código neste projeto.' };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/projetos/${projectId}`);
  revalidatePath(`/projetos/${projectId}/rubricas`);
  return { ok: true, data: { id: data.id } };
}

export async function updateBudgetLine(
  id: string,
  input: BudgetLineFormValues,
): Promise<ActionResult> {
  const parsed = budgetLineFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('budget_lines')
    .update({
      parent_id: parsed.data.parentId,
      code: parsed.data.code === '' ? null : parsed.data.code,
      name: parsed.data.name,
      budgeted_amount:
        parsed.data.budgetedAmount === null ? null : parsed.data.budgetedAmount.toFixed(2),
      sort_order: parsed.data.sortOrder,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('project_id')
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/projetos/${data.project_id}`);
  revalidatePath(`/projetos/${data.project_id}/rubricas`);
  return { ok: true, data: undefined };
}

/**
 * Move a rubrica para dentro de um grupo (ou para a raiz).
 * Recusa mover uma rubrica para dentro de si mesma ou de um descendente,
 * o que criaria um ciclo e faria a montagem da árvore perder linhas.
 */
export async function moveBudgetLine(
  id: string,
  parentId: string | null,
): Promise<ActionResult> {
  if (id === parentId) {
    return { ok: false, error: 'Uma rubrica não pode ser filha dela mesma.' };
  }

  const supabase = createAdminClient();
  const { data: line } = await supabase
    .from('budget_lines')
    .select('project_id')
    .eq('id', id)
    .maybeSingle();

  if (!line) return { ok: false, error: 'Rubrica não encontrada.' };

  if (parentId !== null) {
    const { data: all } = await supabase
      .from('budget_lines')
      .select('id, parent_id')
      .eq('project_id', line.project_id);

    const parentOf = new Map((all ?? []).map((l) => [l.id, l.parent_id]));
    let cursor: string | null = parentId;
    while (cursor !== null) {
      if (cursor === id) {
        return { ok: false, error: 'Isso criaria um ciclo entre as rubricas.' };
      }
      cursor = parentOf.get(cursor) ?? null;
    }
  }

  const { error } = await supabase
    .from('budget_lines')
    .update({ parent_id: parentId, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/projetos/${line.project_id}`);
  revalidatePath(`/projetos/${line.project_id}/rubricas`);
  return { ok: true, data: undefined };
}

export async function deleteBudgetLine(id: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { data: line } = await supabase
    .from('budget_lines')
    .select('project_id')
    .eq('id', id)
    .maybeSingle();

  if (!line) return { ok: false, error: 'Rubrica não encontrada.' };

  const { count } = await supabase
    .from('ledger_entries')
    .select('id', { count: 'exact', head: true })
    .eq('budget_line_id', id);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Esta rubrica tem ${count} lançamento(s). Reclassifique-os antes de excluir.`,
    };
  }

  const { error } = await supabase.from('budget_lines').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/projetos/${line.project_id}`);
  revalidatePath(`/projetos/${line.project_id}/rubricas`);
  return { ok: true, data: undefined };
}

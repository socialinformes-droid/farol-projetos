'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { projectFormSchema, type ActionResult, type ProjectFormValues } from './project-schema';

function toRow(input: ProjectFormValues) {
  return {
    code: input.code,
    name: input.name,
    total_budget: input.totalBudget.toFixed(2),
    start_date: input.startDate,
    end_date: input.endDate,
    status: input.status,
    transfer_limit_pct: input.transferLimitPct.toFixed(2),
    warning_threshold_pct: input.warningThresholdPct.toFixed(2),
    notes: input.notes,
    funding_model: input.fundingModel,
    budget_control: input.budgetControl,
  };
}

export async function createProject(
  input: ProjectFormValues,
): Promise<ActionResult<{ id: string }>> {
  const parsed = projectFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('projects')
    .insert(toRow(parsed.data))
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'Já existe um projeto com esse código de centro de custo.' };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath('/');
  return { ok: true, data: { id: data.id } };
}

export async function updateProject(
  id: string,
  input: ProjectFormValues,
): Promise<ActionResult> {
  const parsed = projectFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('projects')
    .update({ ...toRow(parsed.data), updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/');
  revalidatePath(`/projetos/${id}`);
  return { ok: true, data: undefined };
}

export async function deleteProject(id: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/');
  return { ok: true, data: undefined };
}

'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ActionResult } from './project-schema';
import { mappingFormSchema, type MappingFormValues } from './mapping-schema';

export async function createMapping(
  projectId: string,
  input: MappingFormValues,
): Promise<ActionResult<{ id: string }>> {
  const parsed = mappingFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = createAdminClient();

  const { data: budgetLine } = await supabase
    .from('budget_lines')
    .select('id, project_id')
    .eq('id', parsed.data.budgetLineId)
    .maybeSingle();

  if (!budgetLine || budgetLine.project_id !== projectId) {
    return { ok: false, error: 'Rubrica não encontrada neste projeto.' };
  }

  const { data, error } = await supabase
    .from('budget_line_account_mappings')
    .insert({
      project_id: projectId,
      account_code: parsed.data.accountCode,
      account_name: parsed.data.accountName,
      budget_line_id: parsed.data.budgetLineId,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'Essa conta já está mapeada para outra rubrica neste projeto.' };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/projetos/${projectId}/financeiro/mapeamento`);
  return { ok: true, data: { id: data.id } };
}

export async function deleteMapping(id: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { data: mapping } = await supabase
    .from('budget_line_account_mappings')
    .select('project_id')
    .eq('id', id)
    .maybeSingle();

  if (!mapping) return { ok: false, error: 'Mapeamento não encontrado.' };

  const { error } = await supabase.from('budget_line_account_mappings').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/projetos/${mapping.project_id}/financeiro/mapeamento`);
  return { ok: true, data: undefined };
}

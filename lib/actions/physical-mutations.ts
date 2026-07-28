'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ActionResult } from './project-schema';
import type { PhysicalActivityStatus } from '@/lib/supabase/types';
import {
  activityDatesSchema,
  activityCommentSchema,
  type ActivityDatesValues,
  type ActivityCommentValues,
} from './physical-schema';

function revalidatePhysical(projectId: string) {
  revalidatePath(`/projetos/${projectId}`);
  revalidatePath(`/projetos/${projectId}/fisico`);
  revalidatePath(`/projetos/${projectId}/fisico/entregas`);
}

/**
 * Deriva o status sempre das datas reais — nunca aceito como valor de
 * formulário. É a mesma regra usada na conciliação do import
 * (`physical-reconcile.ts`): fim preenchido conclui, só início preenchido
 * marca em andamento, nenhum dos dois é "não iniciado". O status bruto do
 * SGF nunca entra aqui.
 */
function deriveStatus(
  actualStart: string | null,
  actualEnd: string | null,
): PhysicalActivityStatus {
  if (actualEnd) return 'concluido';
  if (actualStart) return 'em_andamento';
  return 'nao_iniciado';
}

/**
 * Registra ou limpa as datas reais de uma atividade — a própria razão de ser
 * do módulo. O status é recalculado aqui a partir das datas enviadas, nunca
 * recebido do formulário.
 */
export async function updateActivityDates(
  activityId: string,
  input: ActivityDatesValues,
): Promise<ActionResult> {
  const parsed = activityDatesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = createAdminClient();
  const status = deriveStatus(parsed.data.actualStart, parsed.data.actualEnd);

  const { data, error } = await supabase
    .from('activities')
    .update({
      actual_start: parsed.data.actualStart,
      actual_end: parsed.data.actualEnd,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', activityId)
    .select('project_id')
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePhysical(data.project_id);
  return { ok: true, data: undefined };
}

/**
 * Adiciona um comentário datado a uma atividade. `author` é texto livre — a
 * tela sugere os responsáveis já importados, mas não impõe conta de usuário.
 */
export async function addActivityComment(
  activityId: string,
  input: ActivityCommentValues,
): Promise<ActionResult<{ id: string }>> {
  const parsed = activityCommentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = createAdminClient();

  const { data: activity } = await supabase
    .from('activities')
    .select('project_id')
    .eq('id', activityId)
    .maybeSingle();

  if (!activity) return { ok: false, error: 'Atividade não encontrada.' };

  const { data, error } = await supabase
    .from('activity_comments')
    .insert({
      activity_id: activityId,
      author: parsed.data.author,
      body: parsed.data.body,
      happened_on: parsed.data.happenedOn,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePhysical(activity.project_id);
  return { ok: true, data: { id: data.id } };
}

/**
 * Exclui um comentário. Sem restrição por origem — comentários não vêm do
 * import, são sempre digitados aqui.
 */
export async function deleteActivityComment(commentId: string): Promise<ActionResult> {
  const supabase = createAdminClient();

  const { data: comment } = await supabase
    .from('activity_comments')
    .select('activity_id')
    .eq('id', commentId)
    .maybeSingle();

  if (!comment) return { ok: false, error: 'Comentário não encontrado.' };

  const { data: activity } = await supabase
    .from('activities')
    .select('project_id')
    .eq('id', comment.activity_id)
    .maybeSingle();

  const { error } = await supabase.from('activity_comments').delete().eq('id', commentId);
  if (error) return { ok: false, error: error.message };

  if (activity) revalidatePhysical(activity.project_id);
  return { ok: true, data: undefined };
}

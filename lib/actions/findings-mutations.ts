'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ActionResult } from './project-schema';
import type { ActivityFindingInsert, FindingKind } from '@/lib/supabase/types';
import { resolveFindingSchema, type ResolveFindingValues } from './findings-schema';

/**
 * Resolve um apontamento — grava (ou atualiza, se já existia) a marcação em
 * `activity_findings`. Nunca recebe as datas planejadas do cliente: busca o
 * planejado VIGENTE direto de `activities` no momento da resolução e captura
 * nas colunas `_at_resolution`. É esse par que decide, no próximo período, se
 * a marcação ainda vale (`isResolutionStale` em `monitoring-findings.ts`) —
 * e é também por isso que esta action nunca toca `planned_start`/
 * `planned_end`: essas datas pertencem ao SGF, não ao Farol.
 */
export async function resolveFinding(input: ResolveFindingValues): Promise<ActionResult> {
  const parsed = resolveFindingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { activityId, kind, resolution, note, resolvedBy } = parsed.data;

  const supabase = createAdminClient();

  const { data: activity, error: activityError } = await supabase
    .from('activities')
    .select('project_id, planned_start, planned_end')
    .eq('id', activityId)
    .maybeSingle();
  if (activityError) return { ok: false, error: activityError.message };
  if (!activity) return { ok: false, error: 'Atividade não encontrada.' };

  const rows: ActivityFindingInsert[] = [
    {
      project_id: activity.project_id,
      activity_id: activityId,
      kind,
      resolution,
      note,
      planned_start_at_resolution: activity.planned_start,
      planned_end_at_resolution: activity.planned_end,
      resolved_by: resolvedBy,
      resolved_at: new Date().toISOString(),
    },
  ];
  const { error } = await supabase
    .from('activity_findings')
    .upsert(rows, { onConflict: 'activity_id,kind' });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/projetos/${activity.project_id}/monitoramento`);
  return { ok: true, data: undefined };
}

/**
 * Reabre um apontamento resolvido — apaga a marcação, não a arquiva. Sem
 * histórico de reabertura: o próximo `detectFindings` simplesmente volta a
 * tratá-lo como pendente, como se nunca tivesse sido resolvido.
 */
export async function reopenFinding(activityId: string, kind: FindingKind): Promise<ActionResult> {
  const supabase = createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from('activity_findings')
    .select('project_id')
    .eq('activity_id', activityId)
    .eq('kind', kind)
    .maybeSingle();
  if (existingError) return { ok: false, error: existingError.message };
  if (!existing) return { ok: false, error: 'Apontamento não encontrado.' };

  const { error } = await supabase
    .from('activity_findings')
    .delete()
    .eq('activity_id', activityId)
    .eq('kind', kind);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/projetos/${existing.project_id}/monitoramento`);
  return { ok: true, data: undefined };
}

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { DeliverableRow, ActivityRow, ActivityCommentRow } from '@/lib/supabase/types';

export type PhysicalSchedule = {
  deliverables: DeliverableRow[];
  activities: ActivityRow[];
  comments: ActivityCommentRow[];
};

/**
 * Carrega o cronograma físico inteiro de um projeto — entregas, atividades
 * (inclusive as arquivadas, que sumiram do SGF mas nunca são apagadas) e os
 * comentários de todas elas. Usado tanto pelo dashboard (`/fisico`) quanto
 * pela tela de cronograma completo (`/fisico/entregas`).
 */
export async function loadPhysicalSchedule(projectId: string): Promise<PhysicalSchedule> {
  const supabase = createAdminClient();

  const [{ data: deliverables }, { data: activities }] = await Promise.all([
    supabase
      .from('deliverables')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('activities')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true }),
  ]);

  const activityIds = (activities ?? []).map((a) => a.id);

  const { data: comments } =
    activityIds.length > 0
      ? await supabase
          .from('activity_comments')
          .select('*')
          .in('activity_id', activityIds)
          .order('happened_on', { ascending: false })
      : { data: [] as ActivityCommentRow[] };

  return {
    deliverables: deliverables ?? [],
    activities: activities ?? [],
    comments: comments ?? [],
  };
}

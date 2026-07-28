import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveActualValue, type PhysicalReconcilePlan } from '@/lib/domain/physical-reconcile';
import type { DeliverableInsert, ActivityInsert } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: { projectId?: string; filename?: string; plan?: PhysicalReconcilePlan };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
  }

  const { projectId, plan } = body;
  if (!projectId || !plan) {
    return NextResponse.json({ error: 'Plano de importação inválido.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // 1. Entregas presentes no arquivo (novas ou já existentes): upsert com
  // archived_at limpo. Cobre a criação e também a revivência de uma entrega
  // que tinha sumido e voltou a aparecer no arquivo.
  const deliverablesInFile = plan.deliverables.filter((d) => d.situation !== 'sumiu');
  if (deliverablesInFile.length > 0) {
    const rows: DeliverableInsert[] = deliverablesInFile.map((d) => ({
      project_id: projectId,
      name: d.name,
      sort_order: d.sortOrder,
      archived_at: null,
    }));
    const { error } = await supabase
      .from('deliverables')
      .upsert(rows, { onConflict: 'project_id,name' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 2. Entregas sumidas do arquivo: só marca, nunca apaga.
  const deliverablesGone = plan.deliverables.filter(
    (d): d is typeof d & { id: string } => d.situation === 'sumiu' && d.id !== null,
  );
  for (const d of deliverablesGone) {
    const { error } = await supabase
      .from('deliverables')
      .update({ archived_at: now })
      .eq('id', d.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 3. Mapa nome -> id, incluindo as entregas recém-criadas.
  const { data: deliverableRows, error: deliverableFetchError } = await supabase
    .from('deliverables')
    .select('id, name')
    .eq('project_id', projectId);
  if (deliverableFetchError) {
    return NextResponse.json({ error: deliverableFetchError.message }, { status: 500 });
  }
  const deliverableIdByName = new Map((deliverableRows ?? []).map((d) => [d.name, d.id]));

  // 4. Atividades presentes no arquivo: upsert.
  //
  // `resolveActualValue` garante que a data real gravada aqui nunca regride
  // o que o Farol já tinha: no divergente e no pendente, o valor gravado é
  // sempre o mesmo que já estava lá (a linha "muda" para o valor idêntico);
  // só no absorvido a data muda de fato, e é porque o Farol não tinha nada
  // ali — preenchimento, não substituição. Ver `physical-reconcile.ts`.
  const activitiesInFile = plan.activities.filter((a) => a.situation !== 'sumiu');
  const rows: ActivityInsert[] = [];
  for (const a of activitiesInFile) {
    const deliverableId = a.deliverableId ?? deliverableIdByName.get(a.deliverableName) ?? null;
    if (!deliverableId) {
      return NextResponse.json(
        {
          error: `Entrega "${a.deliverableName}" não foi resolvida para a atividade "${a.name}".`,
        },
        { status: 500 },
      );
    }
    rows.push({
      project_id: projectId,
      deliverable_id: deliverableId,
      name: a.name,
      responsible: a.responsible,
      planned_start: a.plannedStart,
      planned_end: a.plannedEnd,
      actual_start: resolveActualValue(a.actualStart),
      actual_end: resolveActualValue(a.actualEnd),
      sgf_actual_start: a.actualStart.sgf,
      sgf_actual_end: a.actualEnd.sgf,
      sgf_status: a.sgfStatus,
      sgf_updated_at: a.sgfUpdatedAt,
      status: a.status,
      sort_order: a.sortOrder,
      import_key: a.importKey,
      archived_at: null,
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from('activities')
      .upsert(rows, { onConflict: 'project_id,import_key' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 5. Atividades sumidas: só marca `archived_at`, sem tocar em mais nenhuma
  // coluna. As datas reais e o vínculo com os comentários (activity_comments
  // referencia activity_id, que nunca muda) ficam intactos.
  const activitiesGone = plan.activities.filter(
    (a): a is typeof a & { activityId: string } => a.situation === 'sumiu' && a.activityId !== null,
  );
  for (const a of activitiesGone) {
    const { error } = await supabase
      .from('activities')
      .update({ archived_at: now })
      .eq('id', a.activityId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath('/');
  revalidatePath(`/projetos/${projectId}`);
  revalidatePath(`/projetos/${projectId}/fisico`);
  revalidatePath(`/projetos/${projectId}/fisico/entregas`);
  revalidatePath(`/projetos/${projectId}/fisico/importar`);

  return NextResponse.json({
    deliverablesUpserted: deliverablesInFile.length,
    deliverablesArchived: deliverablesGone.length,
    activitiesUpserted: rows.length,
    activitiesArchived: activitiesGone.length,
    counts: plan.counts,
  });
}

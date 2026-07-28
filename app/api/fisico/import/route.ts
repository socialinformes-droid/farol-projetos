import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { readPhysicalWorkbook, parsePhysicalRows } from '@/lib/domain/physical-import';
import { reconcilePhysical, type ReconcileContext } from '@/lib/domain/physical-reconcile';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Preview do import físico — não grava nada. Diferente do razão financeiro
 * (que cobre vários projetos por arquivo, casados pelo centro de custo), o
 * cronograma do SGF é exportado por projeto: o formulário sempre manda
 * `projectId` junto com o arquivo.
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file');
  const projectId = formData.get('projectId');

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'Envie o arquivo .xls do cronograma físico.' },
      { status: 400 },
    );
  }
  if (typeof projectId !== 'string' || projectId === '') {
    return NextResponse.json({ error: 'Projeto não informado.' }, { status: 400 });
  }

  let parsed;
  try {
    const rows = await readPhysicalWorkbook(await file.arrayBuffer());
    parsed = parsePhysicalRows(rows);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Não foi possível ler a planilha.' },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: 'Projeto não encontrado.' }, { status: 404 });
  }

  const [{ data: deliverableRows }, { data: activityRows }] = await Promise.all([
    supabase.from('deliverables').select('id, name, sort_order').eq('project_id', projectId),
    supabase
      .from('activities')
      .select(
        'id, import_key, deliverable_id, name, responsible, planned_start, planned_end, actual_start, actual_end, sort_order',
      )
      .eq('project_id', projectId),
  ]);

  const deliverableNameById = new Map((deliverableRows ?? []).map((d) => [d.id, d.name]));

  const context: ReconcileContext = {
    existingDeliverables: (deliverableRows ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      sortOrder: d.sort_order,
    })),
    existingActivities: (activityRows ?? []).map((a) => ({
      id: a.id,
      importKey: a.import_key,
      deliverableId: a.deliverable_id,
      deliverableName: deliverableNameById.get(a.deliverable_id) ?? '',
      name: a.name,
      responsible: a.responsible,
      plannedStart: a.planned_start,
      plannedEnd: a.planned_end,
      actualStart: a.actual_start,
      actualEnd: a.actual_end,
      sortOrder: a.sort_order,
    })),
  };

  return NextResponse.json({
    filename: file.name,
    discardedRows: parsed.discardedRows,
    plan: reconcilePhysical(parsed, context),
  });
}

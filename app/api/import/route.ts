import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { readWorkbookRows, parseLedgerRows } from '@/lib/domain/ledger-import';
import { resolveImport, type ResolutionContext } from '@/lib/domain/import-resolution';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Envie um arquivo .xlsx.' }, { status: 400 });
  }

  let parsed;
  try {
    const rows = await readWorkbookRows(await file.arrayBuffer());
    parsed = parseLedgerRows(rows);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Não foi possível ler a planilha.' },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const codes = parsed.centers.map((c) => c.code);

  const { data: projects } = await supabase
    .from('projects')
    .select('id, code, name')
    .in('code', codes);

  const projectIds = (projects ?? []).map((p) => p.id);

  const [{ data: lines }, { data: existing }, { data: mappings }] = await Promise.all([
    projectIds.length
      ? supabase
          .from('budget_lines')
          .select('id, code, name, project_id')
          .in('project_id', projectIds)
      : Promise.resolve({
          data: [] as { id: string; code: string | null; name: string; project_id: string }[],
        }),
    projectIds.length
      ? supabase
          .from('ledger_entries')
          .select('project_id, import_key')
          .in('project_id', projectIds)
          .eq('source', 'import')
      : Promise.resolve({ data: [] as { project_id: string; import_key: string | null }[] }),
    projectIds.length
      ? supabase
          .from('budget_line_account_mappings')
          .select('project_id, account_code, budget_line_id')
          .in('project_id', projectIds)
      : Promise.resolve({
          data: [] as { project_id: string; account_code: string; budget_line_id: string }[],
        }),
  ]);

  const context: ResolutionContext = {
    projectsByCode: Object.fromEntries(
      (projects ?? []).map((p) => [p.code, { id: p.id, name: p.name }]),
    ),
    budgetLinesByProject: {},
    existingKeysByProject: {},
    mappingsByProject: {},
  };

  for (const l of lines ?? []) {
    (context.budgetLinesByProject[l.project_id] ??= []).push({
      id: l.id,
      code: l.code,
      name: l.name,
    });
  }
  for (const e of existing ?? []) {
    if (e.import_key) {
      (context.existingKeysByProject[e.project_id] ??= []).push(e.import_key);
    }
  }
  for (const m of mappings ?? []) {
    (context.mappingsByProject[m.project_id] ??= []).push({
      accountCode: m.account_code,
      budgetLineId: m.budget_line_id,
    });
  }

  return NextResponse.json({
    filename: file.name,
    discardedRows: parsed.discardedRows,
    plan: resolveImport(parsed.entries, context),
  });
}

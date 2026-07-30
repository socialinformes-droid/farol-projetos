import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ProjectPlan } from '@/lib/domain/import-resolution';
import type { LedgerEntryInsert } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BATCH_SIZE = 500;

// Validação local só do campo novo (`resolutions`) — as rotas de import não
// têm Zod hoje (destoa do resto do app, que valida tudo com Server Action +
// Zod), e não é o momento de reescrever a validação manual já existente ao
// redor deste payload. Ver docs/superpowers/specs/2026-07-30-mapeamento-conta-rubrica-design.md.
const resolutionSchema = z.discriminatedUnion('action', [
  z.object({
    accountCode: z.string().trim().min(1),
    action: z.literal('existing'),
    budgetLineId: z.string().uuid(),
  }),
  z.object({
    accountCode: z.string().trim().min(1),
    action: z.literal('create'),
    name: z.string().trim().min(1),
  }),
]);
type Resolution = z.infer<typeof resolutionSchema>;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function POST(request: Request) {
  let body: { filename?: string; plan?: ProjectPlan; resolutions?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
  }

  const { filename, plan, resolutions: rawResolutions } = body;
  if (!filename || !plan || !plan.projectId) {
    return NextResponse.json({ error: 'Plano de importação inválido.' }, { status: 400 });
  }

  const resolutionsResult = z.array(resolutionSchema).safeParse(rawResolutions ?? []);
  if (!resolutionsResult.success) {
    return NextResponse.json({ error: 'Resoluções de conta inválidas.' }, { status: 400 });
  }
  const resolutions: Resolution[] = resolutionsResult.data;

  const supabase = createAdminClient();

  // 1. Reaproveita mapeamento já gravado numa tentativa anterior (retry): sem
  // isso, repetir o commit com as mesmas resoluções criaria uma segunda
  // rubrica para cada conta resolvida como "criar nova".
  const resolutionCodes = resolutions.map((r) => r.accountCode);
  const { data: alreadyMapped } =
    resolutionCodes.length > 0
      ? await supabase
          .from('budget_line_account_mappings')
          .select('account_code, budget_line_id')
          .eq('project_id', plan.projectId)
          .in('account_code', resolutionCodes)
      : { data: [] as { account_code: string; budget_line_id: string }[] };

  const accountCodeToBudgetLineId = new Map<string, string>(
    (alreadyMapped ?? []).map((m) => [m.account_code, m.budget_line_id]),
  );

  for (const r of resolutions) {
    if (r.action === 'existing' && !accountCodeToBudgetLineId.has(r.accountCode)) {
      accountCodeToBudgetLineId.set(r.accountCode, r.budgetLineId);
    }
  }

  // 2. Cria as rubricas para as resoluções "criar nova" que ainda não têm
  // mapeamento (primeira tentativa). Sem código: o código da conta passa a
  // viver só no mapeamento, não em `budget_lines.code`.
  for (const r of resolutions) {
    if (r.action !== 'create' || accountCodeToBudgetLineId.has(r.accountCode)) continue;

    const { data: created, error: createError } = await supabase
      .from('budget_lines')
      .insert({
        project_id: plan.projectId,
        parent_id: null,
        code: null,
        name: r.name,
        budgeted_amount: null,
        sort_order: 0,
      })
      .select('id')
      .single();

    if (createError || !created) {
      return NextResponse.json(
        { error: createError?.message ?? 'Não foi possível criar a rubrica.' },
        { status: 500 },
      );
    }
    accountCodeToBudgetLineId.set(r.accountCode, created.id);
  }

  // 3. Grava o mapeamento conta -> rubrica para as duas resoluções — é o que
  // faz o próximo import da mesma conta resolver sozinho, sem perguntar de
  // novo. Upsert: idempotente num retry.
  if (resolutions.length > 0) {
    const { error: mappingError } = await supabase.from('budget_line_account_mappings').upsert(
      resolutions.map((r) => ({
        project_id: plan.projectId,
        account_code: r.accountCode,
        account_name:
          plan.unmappedAccounts.find((u) => u.code === r.accountCode)?.name ?? null,
        budget_line_id: accountCodeToBudgetLineId.get(r.accountCode)!,
      })),
      { onConflict: 'project_id,account_code' },
    );

    if (mappingError) {
      return NextResponse.json({ error: mappingError.message }, { status: 500 });
    }
  }

  // 4. Cria o batch com os contadores conhecidos pelo plano.
  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .insert({
      project_id: plan.projectId,
      filename,
      rows_read: plan.newEntries.length + plan.duplicateCount,
      rows_inserted: 0,
      rows_duplicate: plan.duplicateCount,
      rows_unmapped: plan.unmappedCount,
    })
    .select('id')
    .single();

  if (batchError || !batch) {
    return NextResponse.json(
      { error: batchError?.message ?? 'Não foi possível criar o lote de importação.' },
      { status: 500 },
    );
  }
  const batchId: string = batch.id;

  // 5. Insere os lançamentos em lotes de 500.
  //
  // O índice de idempotência (project_id, import_key) é parcial
  // (`where source = 'import'`) — o Postgres só usa um índice parcial como
  // alvo de ON CONFLICT quando o predicado é repetido na cláusula, e o
  // upsert do PostgREST/supabase-js não permite declarar esse predicado.
  // Verificado ao vivo: `.upsert(..., { onConflict: 'project_id,import_key' })`
  // falha sempre com 42P10 ("no unique or exclusion constraint matching the
  // ON CONFLICT specification"), mesmo sem conflito nenhum nos dados — não é
  // uma alternativa viável aqui. Em vez disso, inserimos com INSERT simples
  // (o plano já chega deduplicado pelo `resolveImport`, que consultou as
  // chaves existentes) e, se um lote inteiro for rejeitado por 23505 — o que
  // só aconteceria numa corrida entre duas importações do mesmo arquivo — ele
  // é refeito linha a linha para salvar as que não colidem.
  const rows: LedgerEntryInsert[] = plan.newEntries.map((entry) => ({
    project_id: plan.projectId,
    budget_line_id: entry.budgetLineId ?? accountCodeToBudgetLineId.get(entry.accountCode) ?? null,
    entry_date: entry.entryDate,
    amount: entry.amount.toFixed(2),
    kind: entry.kind,
    description: entry.description,
    account_code: entry.accountCode,
    account_name: entry.accountName,
    cost_center_code: entry.costCenterCode,
    voucher: entry.voucher,
    journal: entry.journal,
    document: entry.document,
    reference: entry.reference,
    vendor_doc: entry.vendorDoc,
    vendor_name: entry.vendorName,
    payment_date: entry.paymentDate,
    document_date: entry.documentDate,
    urls: entry.urls,
    source: 'import',
    notes: null,
    import_key: entry.importKey,
    import_batch_id: batchId,
    raw: entry.raw,
  }));

  let inserted = 0;
  try {
    for (const batchRows of chunk(rows, BATCH_SIZE)) {
      const { data, error } = await supabase.from('ledger_entries').insert(batchRows).select('id');

      if (!error) {
        inserted += data?.length ?? 0;
        continue;
      }

      if (error.code !== '23505') throw new Error(error.message);

      // Colisão no lote: refaz linha a linha para salvar o que não conflita.
      for (const row of batchRows) {
        const single = await supabase.from('ledger_entries').insert(row).select('id');
        if (!single.error) {
          inserted += single.data?.length ?? 0;
        } else if (single.error.code !== '23505') {
          throw new Error(single.error.message);
        }
      }
    }
  } catch (e) {
    // Os lançamentos já gravados permanecem — o import é idempotente e uma
    // nova tentativa (com um preview atualizado) só completa o que falta.
    await supabase.from('import_batches').delete().eq('id', batchId);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Falha ao gravar os lançamentos.' },
      { status: 500 },
    );
  }

  // 6. Atualiza o batch com o número realmente gravado.
  const { error: updateError } = await supabase
    .from('import_batches')
    .update({ rows_inserted: inserted })
    .eq('id', batchId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  revalidatePath('/');
  revalidatePath(`/projetos/${plan.projectId}`);
  revalidatePath(`/projetos/${plan.projectId}/financeiro`);
  revalidatePath(`/projetos/${plan.projectId}/financeiro/lancamentos`);
  revalidatePath(`/projetos/${plan.projectId}/financeiro/rubricas`);
  revalidatePath(`/projetos/${plan.projectId}/financeiro/importar`);
  revalidatePath(`/projetos/${plan.projectId}/financeiro/mapeamento`);

  return NextResponse.json({
    inserted,
    duplicates: plan.duplicateCount,
    unmapped: plan.unmappedCount,
    batchId,
  });
}

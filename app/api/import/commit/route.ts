import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ProjectPlan } from '@/lib/domain/import-resolution';
import type { LedgerEntryInsert } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BATCH_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function POST(request: Request) {
  let body: { filename?: string; plan?: ProjectPlan };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
  }

  const { filename, plan } = body;
  if (!filename || !plan || !plan.projectId) {
    return NextResponse.json({ error: 'Plano de importação inválido.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 1. Cria as rubricas novas (sem orçamento). ignoreDuplicates protege contra
  // um retry com um plano desatualizado — o índice único (project_id, code)
  // não é parcial, então o upsert funciona normalmente aqui.
  if (plan.newBudgetLines.length > 0) {
    const { error: linesError } = await supabase.from('budget_lines').upsert(
      plan.newBudgetLines.map((l) => ({
        project_id: plan.projectId,
        parent_id: null,
        code: l.code,
        name: l.name,
        budgeted_amount: null,
        sort_order: 0,
      })),
      { onConflict: 'project_id,code', ignoreDuplicates: true },
    );

    if (linesError) {
      return NextResponse.json({ error: linesError.message }, { status: 500 });
    }
  }

  // 2. Mapa código -> id, juntando as rubricas recém-criadas às que já existiam.
  const codeToId = new Map<string, string>();
  if (plan.newBudgetLines.length > 0) {
    const { data: createdLines, error: fetchError } = await supabase
      .from('budget_lines')
      .select('id, code')
      .eq('project_id', plan.projectId)
      .in(
        'code',
        plan.newBudgetLines.map((l) => l.code),
      );

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    for (const l of createdLines ?? []) {
      if (l.code) codeToId.set(l.code, l.id);
    }
  }

  // 3. Cria o batch com os contadores conhecidos pelo plano.
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

  // 4. Insere os lançamentos em lotes de 500.
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
    budget_line_id: entry.budgetLineId ?? codeToId.get(entry.budgetLineCode) ?? null,
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

  // 5. Atualiza o batch com o número realmente gravado.
  const { error: updateError } = await supabase
    .from('import_batches')
    .update({ rows_inserted: inserted })
    .eq('id', batchId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  revalidatePath('/');
  revalidatePath(`/projetos/${plan.projectId}`);
  revalidatePath(`/projetos/${plan.projectId}/lancamentos`);
  revalidatePath(`/projetos/${plan.projectId}/rubricas`);
  revalidatePath(`/projetos/${plan.projectId}/importar`);

  return NextResponse.json({
    inserted,
    duplicates: plan.duplicateCount,
    unmapped: plan.unmappedCount,
    batchId,
  });
}

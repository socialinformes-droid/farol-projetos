'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ActionResult } from './project-schema';
import { entryFormSchema, type EntryFormValues } from './entry-schema';

function revalidateEntry(projectId: string) {
  revalidatePath(`/projetos/${projectId}`);
  revalidatePath(`/projetos/${projectId}/lancamentos`);
}

/**
 * Cria um lançamento manual — para um compromisso ainda não presente no
 * razão contábil. `kind` e `source` são fixos ('manual'/'manual') e
 * `voucher`/`journal` sempre nulos: é essa dupla que forma a chave de
 * dedupe do import (`project_id, voucher, journal` onde `source = 'import'`),
 * então um lançamento manual nunca pode colidir com ela.
 */
export async function createEntry(
  projectId: string,
  input: EntryFormValues,
): Promise<ActionResult<{ id: string }>> {
  const parsed = entryFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('ledger_entries')
    .insert({
      project_id: projectId,
      budget_line_id: parsed.data.budgetLineId,
      entry_date: parsed.data.entryDate,
      amount: parsed.data.amount.toFixed(2),
      kind: 'manual',
      description: parsed.data.description,
      account_code: null,
      account_name: null,
      cost_center_code: null,
      voucher: null,
      journal: null,
      document: parsed.data.document,
      reference: null,
      vendor_doc: null,
      vendor_name: parsed.data.vendorName,
      payment_date: null,
      document_date: null,
      urls: {},
      source: 'manual',
    // Lançamento manual não vem do razão: sem chave de idempotência.
    import_key: null,
      import_batch_id: null,
      raw: null,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  revalidateEntry(projectId);
  return { ok: true, data: { id: data.id } };
}

/**
 * Atualiza os campos editáveis de um lançamento (rubrica, data, valor,
 * descrição, fornecedor, documento). Os campos vindos do razão (voucher,
 * journal, account_*, urls, raw, source...) ficam intocados.
 */
export async function updateEntry(
  id: string,
  input: EntryFormValues,
): Promise<ActionResult> {
  const parsed = entryFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('ledger_entries')
    .update({
      budget_line_id: parsed.data.budgetLineId,
      entry_date: parsed.data.entryDate,
      amount: parsed.data.amount.toFixed(2),
      description: parsed.data.description,
      vendor_name: parsed.data.vendorName,
      document: parsed.data.document,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('project_id')
    .single();

  if (error) return { ok: false, error: error.message };

  revalidateEntry(data.project_id);
  return { ok: true, data: undefined };
}

/**
 * Reclassifica um lançamento para outra rubrica (ou para "sem rubrica",
 * `null`). Vale para qualquer origem — inclusive lançamentos importados,
 * que não podem ser excluídos mas podem sempre ser reclassificados.
 */
export async function reclassifyEntry(
  id: string,
  budgetLineId: string | null,
): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('ledger_entries')
    .update({ budget_line_id: budgetLineId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('project_id')
    .single();

  if (error) return { ok: false, error: error.message };

  revalidateEntry(data.project_id);
  return { ok: true, data: undefined };
}

/**
 * Exclui um lançamento — recusado para `source === 'import'`. O import é
 * idempotente via índice único em (project_id, voucher, journal); apagar uma
 * linha importada libera essa chave, e a próxima importação a reinsere
 * silenciosamente, fazendo a exclusão parecer não ter efeito. Reclassificar
 * é sempre permitido; excluir, não.
 */
export async function deleteEntry(id: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { data: entry } = await supabase
    .from('ledger_entries')
    .select('project_id, source')
    .eq('id', id)
    .maybeSingle();

  if (!entry) return { ok: false, error: 'Lançamento não encontrado.' };

  if (entry.source === 'import') {
    return {
      ok: false,
      error:
        'Lançamentos importados do razão não podem ser excluídos. Reclassifique-o ou ajuste no sistema de origem.',
    };
  }

  const { error } = await supabase.from('ledger_entries').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidateEntry(entry.project_id);
  return { ok: true, data: undefined };
}

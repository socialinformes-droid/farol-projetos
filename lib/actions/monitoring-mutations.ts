'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ActionResult } from './project-schema';
import { buildProjectMonitoringSnapshot } from '@/lib/domain/monitoring-queries';
import { renderMonitoringMarkdown, type MonitoringFields } from '@/lib/domain/monitoring-render';
import type { MonitoringSnapshot } from '@/lib/domain/monitoring-snapshot';
import { toISODate } from '@/lib/format';
import {
  monitoringPeriodSchema,
  monitoringFieldsSchema,
  type MonitoringPeriodValues,
  type MonitoringFieldsValues,
} from './monitoring-schema';

function revalidateMonitoring(projectId: string) {
  revalidatePath(`/projetos/${projectId}`);
  revalidatePath(`/projetos/${projectId}/monitoramento`);
}

/**
 * Monta o snapshot do período sem gravar nada — usado pela tela "Novo
 * monitoramento" para mostrar o registro coletado antes de criar qualquer
 * coisa (e antes de decidir se vale a pena gerar com IA).
 */
export async function previewMonitoringSnapshot(
  projectId: string,
  input: MonitoringPeriodValues,
): Promise<ActionResult<{ snapshot: MonitoringSnapshot; draft: MonitoringFields }>> {
  const parsed = monitoringPeriodSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const snapshot = await buildProjectMonitoringSnapshot(
    projectId,
    { start: parsed.data.periodStart, end: parsed.data.periodEnd },
    toISODate(new Date()),
  );
  if (!snapshot) return { ok: false, error: 'Projeto não encontrado.' };

  return { ok: true, data: { snapshot, draft: renderMonitoringMarkdown(snapshot) } };
}

/**
 * Cria o monitoramento do período. Os cinco campos já nascem preenchidos com
 * o rascunho não-IA (`renderMonitoringMarkdown`) — o registro é útil mesmo
 * que o gestor nunca clique em "gerar com IA".
 */
export async function createMonitoring(
  projectId: string,
  input: MonitoringPeriodValues,
): Promise<ActionResult<{ id: string }>> {
  const preview = await previewMonitoringSnapshot(projectId, input);
  if (!preview.ok) return preview;

  const parsed = monitoringPeriodSchema.parse(input);
  const { snapshot, draft } = preview.data;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('monitorings')
    .insert({
      project_id: projectId,
      period_start: parsed.periodStart,
      period_end: parsed.periodEnd,
      reference_label: parsed.referenceLabel,
      desempenho_fisico: draft.desempenhoFisico,
      resultados: draft.resultados,
      desempenho_financeiro: draft.desempenhoFinanceiro,
      riscos: draft.riscos,
      conclusao: draft.conclusao,
      snapshot: snapshot as unknown as Record<string, unknown>,
      generated_at: null,
      generated_model: null,
      submitted_at: null,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  revalidateMonitoring(projectId);
  return { ok: true, data: { id: data.id } };
}

/** Salva as edições do gestor nos cinco campos — sobrescreve o que a IA (ou o rascunho) tinha gerado. */
export async function updateMonitoringFields(
  id: string,
  input: MonitoringFieldsValues,
): Promise<ActionResult> {
  const parsed = monitoringFieldsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('monitorings')
    .update({
      desempenho_fisico: parsed.data.desempenhoFisico,
      resultados: parsed.data.resultados,
      desempenho_financeiro: parsed.data.desempenhoFinanceiro,
      riscos: parsed.data.riscos,
      conclusao: parsed.data.conclusao,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('project_id')
    .single();

  if (error) return { ok: false, error: error.message };

  revalidateMonitoring(data.project_id);
  return { ok: true, data: undefined };
}

/** Marca que o gestor já enviou este monitoramento ao PMO. Idempotente: reenviar só atualiza o carimbo. */
export async function markMonitoringSubmitted(id: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('monitorings')
    .update({ submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('project_id')
    .single();

  if (error) return { ok: false, error: error.message };

  revalidateMonitoring(data.project_id);
  return { ok: true, data: undefined };
}

export async function deleteMonitoring(id: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from('monitorings')
    .select('project_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing) return { ok: false, error: 'Monitoramento não encontrado.' };

  const { error } = await supabase.from('monitorings').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidateMonitoring(existing.project_id);
  return { ok: true, data: undefined };
}

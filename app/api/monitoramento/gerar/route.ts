import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildProjectMonitoringSnapshot, loadActivityFindings } from '@/lib/domain/monitoring-queries';
import {
  detectFindings,
  resolvedFindings,
  existingFindingFromRow,
} from '@/lib/domain/monitoring-findings';
import { buildMonitoringPromptMessages, parseAiFields } from '@/lib/domain/monitoring-prompt';
import { generateText, AiGenerationError } from '@/lib/ai/deepseek';
import { toISODate } from '@/lib/format';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Gera os cinco campos do monitoramento com IA a partir do registro já
 * coletado. Passo 1 (carregar dados + montar snapshot) e passo 2 (salvar o
 * snapshot) SEMPRE acontecem, mesmo que a chamada à IA falhe — é essa ordem
 * que garante que o registro factual sobrevive a uma geração malsucedida
 * (conta do DeepSeek sem saldo, timeout, etc.).
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const monitoringId = body?.monitoringId;

  if (typeof monitoringId !== 'string' || monitoringId === '') {
    return NextResponse.json({ error: 'Informe o monitoramento (monitoringId).' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: monitoring } = await supabase
    .from('monitorings')
    .select('*')
    .eq('id', monitoringId)
    .maybeSingle();

  if (!monitoring) {
    return NextResponse.json({ error: 'Monitoramento não encontrado.' }, { status: 404 });
  }

  const snapshot = await buildProjectMonitoringSnapshot(
    monitoring.project_id,
    { start: monitoring.period_start, end: monitoring.period_end },
    toISODate(new Date()),
  );

  if (!snapshot) {
    return NextResponse.json({ error: 'Projeto não encontrado.' }, { status: 404 });
  }

  // Salva o snapshot atualizado ANTES de chamar a IA — o registro factual
  // não pode depender do sucesso da geração.
  const { error: snapshotError } = await supabase
    .from('monitorings')
    .update({
      snapshot: snapshot as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    })
    .eq('id', monitoringId);

  if (snapshotError) {
    return NextResponse.json({ error: snapshotError.message }, { status: 500 });
  }

  // Barreira de análise: apontamento crítico pendente bloqueia a geração —
  // ver `lib/domain/monitoring-findings.ts`. Complementar não bloqueia; vira
  // "[a confirmar]" no texto gerado, como já acontecia antes desta barreira.
  const findingRows = await loadActivityFindings(monitoring.project_id);
  const existingFindings = findingRows.map(existingFindingFromRow);
  const pendingCritical = detectFindings(snapshot, existingFindings).filter(
    (f) => f.severity === 'critico',
  );

  if (pendingCritical.length > 0) {
    return NextResponse.json(
      {
        error: `Há ${pendingCritical.length} apontamento(s) crítico(s) pendente(s) de resolução. Resolva-os na tela de Análise do período antes de gerar com IA.`,
        snapshotSaved: true,
      },
      { status: 409 },
    );
  }

  const { data: projectRow } = await supabase
    .from('projects')
    .select('context_document')
    .eq('id', monitoring.project_id)
    .maybeSingle();

  try {
    const resolved = resolvedFindings(snapshot, existingFindings);
    const messages = buildMonitoringPromptMessages(snapshot, resolved, projectRow?.context_document);
    const raw = await generateText(messages);
    const fields = parseAiFields(raw);

    const { error: updateError } = await supabase
      .from('monitorings')
      .update({
        desempenho_fisico: fields.desempenhoFisico,
        resultados: fields.resultados,
        desempenho_financeiro: fields.desempenhoFinanceiro,
        riscos: fields.riscos,
        conclusao: fields.conclusao,
        generated_at: new Date().toISOString(),
        generated_model: 'deepseek-chat',
        updated_at: new Date().toISOString(),
      })
      .eq('id', monitoringId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ fields });
  } catch (e) {
    const message =
      e instanceof AiGenerationError
        ? e.message
        : e instanceof Error
          ? `Não foi possível interpretar a resposta da IA: ${e.message}`
          : 'Falha desconhecida ao gerar texto com IA.';

    // O snapshot já foi salvo acima — o registro factual não se perde.
    return NextResponse.json({ error: message, snapshotSaved: true }, { status: 502 });
  }
}

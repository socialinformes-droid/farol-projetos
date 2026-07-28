import type { ActivityFindingRow, FindingKind, FindingResolution } from '@/lib/supabase/types';
import { formatDateBR } from '@/lib/format';
import type {
  MonitoringSnapshot,
  DelayedActivity,
  InProgressActivity,
  ConcludedDeliverableInfo,
} from './monitoring-snapshot';

/**
 * Barreira de análise entre o registro factual do período e o texto do
 * monitoramento — ver `supabase/migrations/0010_analise_monitoramento.sql`
 * para o desenho completo. Puro, sem Supabase: recebe o snapshot já montado
 * (`monitoring-snapshot.ts`) e as marcações já persistidas, devolve os
 * apontamentos que ainda precisam de decisão do gestor.
 *
 * Nem todo alerta é um problema real — o exemplo que motivou este módulo é
 * um curso cuja data mudou: o snapshot reporta "53 dias de atraso", mas o
 * atraso não existe, o planejamento é que foi replanejado. Por isso a
 * resolução tem três saídas (`justificado`, `replanejado`, `dispensado`) e
 * NUNCA altera `planned_start`/`planned_end` — essas datas pertencem ao SGF.
 *
 * A resolução persiste entre períodos, mas EXPIRA: as colunas
 * `planned_*_at_resolution` guardam o planejado vigente no momento da
 * marcação; se o SGF muda o planejamento depois, elas deixam de bater com o
 * planejado atual e o apontamento volta a aparecer como pendente
 * (`isResolutionStale`). É a salvaguarda contra o gestor "cegar" para um
 * desvio genuinamente novo.
 */

export type FindingSeverity = 'critico' | 'complementar';

export type DetectedFinding = {
  activityId: string;
  kind: FindingKind;
  severity: FindingSeverity;
  /** Descrição factual em português — nunca julgamento, só o que os dados mostram. */
  description: string;
  deliverableName: string;
  activityName: string;
  /** Planejado vigente no momento da detecção — usado para checar se uma resolução futura ficou obsoleta. */
  plannedStart: string | null;
  plannedEnd: string | null;
};

export type ResolvedFinding = DetectedFinding & {
  resolution: FindingResolution;
  note: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
};

/** Marcação já persistida (tipo de domínio — ver `existingFindingFromRow` para o mapeamento da linha do banco). */
export type ExistingFinding = {
  activityId: string;
  kind: FindingKind;
  resolution: FindingResolution;
  note: string | null;
  plannedStartAtResolution: string | null;
  plannedEndAtResolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
};

export function existingFindingFromRow(row: ActivityFindingRow): ExistingFinding {
  return {
    activityId: row.activity_id,
    kind: row.kind,
    resolution: row.resolution,
    note: row.note,
    plannedStartAtResolution: row.planned_start_at_resolution,
    plannedEndAtResolution: row.planned_end_at_resolution,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
  };
}

function findingKey(activityId: string, kind: FindingKind): string {
  return `${activityId}:${kind}`;
}

/**
 * Verdadeiro quando a marcação já persistida não bate mais com o planejado
 * vigente da atividade — o SGF replanejou depois que o gestor resolveu o
 * apontamento, então a decisão antiga não pode mais ser aplicada ao novo
 * desvio sem revisão.
 */
export function isResolutionStale(
  existing: Pick<ExistingFinding, 'plannedStartAtResolution' | 'plannedEndAtResolution'>,
  current: { plannedStart: string | null; plannedEnd: string | null },
): boolean {
  return (
    existing.plannedStartAtResolution !== current.plannedStart ||
    existing.plannedEndAtResolution !== current.plannedEnd
  );
}

function describeDelayed(a: DelayedActivity): string {
  const planejado = a.plannedEnd ? formatDateBR(a.plannedEnd) : 'sem data planejada';
  const situacao =
    a.status === 'em_aberto'
      ? `em aberto, ${a.daysLate} dia(s) de atraso frente ao planejado (${planejado})`
      : `concluída com ${a.daysLate} dia(s) de atraso frente ao planejado (${planejado})`;
  return `${a.deliverableName} — ${a.name}: ${situacao}, sem justificativa registrada.`;
}

function describeInProgressOverdue(a: InProgressActivity): string {
  const planejado = a.plannedEnd ? formatDateBR(a.plannedEnd) : 'sem data planejada';
  return `${a.deliverableName} — ${a.name}: em andamento desde ${formatDateBR(a.actualStart)}, já ultrapassou o término planejado (${planejado}).`;
}

function describeBenefit(d: ConcludedDeliverableInfo): string {
  return `${d.name}: entrega concluída em ${formatDateBR(d.concludedAt)} sem comentário registrado descrevendo o benefício gerado.`;
}

/**
 * Monta os candidatos a apontamento a partir do snapshot, sem olhar para
 * resoluções já persistidas — a filtragem por resolução acontece depois, em
 * `detectFindings`/`resolvedFindings`, para que as duas funções compartilhem
 * exatamente a mesma lista de candidatos.
 *
 * Três detectores, sem sobreposição de `kind` (a unicidade de
 * `activity_findings` é por `(activity_id, kind)`):
 *
 * - `sem_justificativa`: TODA atividade atrasada (`delayedActivities`, aberta
 *   ou concluída com atraso). Diferente do apontamento de benefício, aqui
 *   não existe hoje nenhum lugar para o gestor justificar um atraso — é
 *   exatamente para isso que esta tabela foi criada — então o candidato
 *   nasce incondicional; só a resolução (`justificado`/`replanejado`/
 *   `dispensado`) o tira da lista de pendências.
 * - `atraso`: atividades EM ANDAMENTO cujo planejado já passou. É um fato
 *   distinto de `sem_justificativa` (o status "em andamento" ficou
 *   desatualizado frente ao prazo) e pode coexistir com ele na mesma
 *   atividade — o gestor resolve cada um de forma independente.
 * - `beneficio`: entrega concluída no período cuja atividade de fechamento
 *   não tem nenhum comentário registrado no período. Diferente do atraso,
 *   comentário já é um canal existente (`activity_comments`) — se o gestor já
 *   usou para descrever o benefício, não faz sentido abrir mais um apontamento.
 */
function buildCandidates(snapshot: MonitoringSnapshot): DetectedFinding[] {
  const commentedActivityIds = new Set(snapshot.commentsByActivity.map((g) => g.activityId));
  const concludedActivityById = new Map(snapshot.concludedActivities.map((a) => [a.id, a]));

  const candidates: DetectedFinding[] = [];

  for (const a of snapshot.delayedActivities) {
    candidates.push({
      activityId: a.id,
      kind: 'sem_justificativa',
      severity: 'critico',
      description: describeDelayed(a),
      deliverableName: a.deliverableName,
      activityName: a.name,
      plannedStart: a.plannedStart,
      plannedEnd: a.plannedEnd,
    });
  }

  for (const a of snapshot.inProgressActivities) {
    if (a.plannedEnd !== null && a.plannedEnd < snapshot.referenceDate) {
      candidates.push({
        activityId: a.id,
        kind: 'atraso',
        severity: 'critico',
        description: describeInProgressOverdue(a),
        deliverableName: a.deliverableName,
        activityName: a.name,
        plannedStart: a.plannedStart,
        plannedEnd: a.plannedEnd,
      });
    }
  }

  for (const d of snapshot.concludedDeliverables) {
    if (commentedActivityIds.has(d.closingActivityId)) continue;
    const closing = concludedActivityById.get(d.closingActivityId);
    candidates.push({
      activityId: d.closingActivityId,
      kind: 'beneficio',
      severity: 'complementar',
      description: describeBenefit(d),
      deliverableName: d.name,
      activityName: closing?.name ?? d.name,
      plannedStart: closing?.plannedStart ?? null,
      plannedEnd: closing?.plannedEnd ?? null,
    });
  }

  return candidates;
}

/**
 * Apontamentos pendentes de decisão: candidatos sem marcação, mais os que
 * têm marcação mas ela expirou (planejado mudou desde a resolução). Filtra
 * fora quem está resolvido e ainda válido — esses saem em `resolvedFindings`.
 */
export function detectFindings(
  snapshot: MonitoringSnapshot,
  existingFindings: ExistingFinding[],
): DetectedFinding[] {
  const existingByKey = new Map(existingFindings.map((f) => [findingKey(f.activityId, f.kind), f]));

  return buildCandidates(snapshot).filter((f) => {
    const existing = existingByKey.get(findingKey(f.activityId, f.kind));
    if (!existing || existing.resolution === 'pendente') return true;
    return isResolutionStale(existing, { plannedStart: f.plannedStart, plannedEnd: f.plannedEnd });
  });
}

/**
 * Apontamentos já resolvidos pelo gestor e ainda válidos — para a tela de
 * análise exibir com opção de reabrir. Um apontamento cuja resolução expirou
 * não aparece aqui: ele já voltou para `detectFindings` como pendente.
 */
export function resolvedFindings(
  snapshot: MonitoringSnapshot,
  existingFindings: ExistingFinding[],
): ResolvedFinding[] {
  const candidatesByKey = new Map(
    buildCandidates(snapshot).map((f) => [findingKey(f.activityId, f.kind), f]),
  );

  const resolved: ResolvedFinding[] = [];
  for (const existing of existingFindings) {
    if (existing.resolution === 'pendente') continue;
    const candidate = candidatesByKey.get(findingKey(existing.activityId, existing.kind));
    if (!candidate) continue;
    if (isResolutionStale(existing, { plannedStart: candidate.plannedStart, plannedEnd: candidate.plannedEnd })) {
      continue;
    }
    resolved.push({
      ...candidate,
      resolution: existing.resolution,
      note: existing.note,
      resolvedBy: existing.resolvedBy,
      resolvedAt: existing.resolvedAt,
    });
  }
  return resolved;
}

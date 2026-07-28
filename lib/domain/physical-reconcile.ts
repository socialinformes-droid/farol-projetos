import type { ParsedActivity, PhysicalParseResult } from './physical-import';

export type PhysicalStatus = 'nao_iniciado' | 'em_andamento' | 'concluido';

/**
 * Estado de um campo de data real (início ou fim) após comparar o que o
 * Farol já tem gravado com o que o arquivo do SGF trouxe.
 *
 * - vazio: nenhum dos dois tem a data.
 * - pendente_sgf: o Farol tem, o SGF não — fila de lançamento manual no SGF.
 * - absorvido: o SGF tem, o Farol não — alguém digitou direto no SGF; o
 *   Farol absorve esse valor.
 * - reconciliado: os dois têm a mesma data.
 * - divergente: os dois têm data, mas diferentes — nada é resolvido
 *   automaticamente, os dois valores ficam visíveis para decisão humana.
 */
export type FieldState = 'vazio' | 'pendente_sgf' | 'absorvido' | 'reconciliado' | 'divergente';

export type DateField = {
  /** Data real gravada no Farol (nunca sobrescrita pelo import). */
  farol: string | null;
  /** Data real que o arquivo do SGF traz nesta rodada. */
  sgf: string | null;
  state: FieldState;
};

/**
 * Situação geral da atividade, para agrupar a fila e a tela de preview do
 * import. Quando início e fim têm estados diferentes, prevalece o mais
 * acionável — divergência é mais urgente que pendência, que é mais urgente
 * que uma absorção silenciosa.
 */
export type ActivitySituation =
  | 'novo'
  | 'reconciliado'
  | 'pendente_sgf'
  | 'absorvido'
  | 'divergente'
  | 'sumiu';

export type ExistingActivity = {
  id: string;
  importKey: string;
  deliverableId: string;
  deliverableName: string;
  name: string;
  responsible: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  /** Datas reais já gravadas no Farol — nunca sobrescritas pelo import. */
  actualStart: string | null;
  actualEnd: string | null;
  sortOrder: number;
};

export type ExistingDeliverable = {
  id: string;
  name: string;
  sortOrder: number;
};

export type ReconcileContext = {
  existingDeliverables: ExistingDeliverable[];
  existingActivities: ExistingActivity[];
};

export type ReconciledActivity = {
  importKey: string;
  /** id no banco quando a atividade já existe; null quando é nova (criada no commit). */
  activityId: string | null;
  deliverableName: string;
  /** id da entrega quando ela já existe; null quando será criada no commit. */
  deliverableId: string | null;
  name: string;
  responsible: string | null;
  /** Sempre o que o arquivo mais recente diz — um replanejamento é legítimo. */
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: DateField;
  actualEnd: DateField;
  /** Derivado das datas reais do Farol (nunca do status bruto do SGF). */
  status: PhysicalStatus;
  situation: ActivitySituation;
  sortOrder: number;
  /**
   * Metadados brutos do SGF, guardados para exibição/auditoria — não entram
   * no cálculo de status nem de situação. Nulos para atividades "sumiu": o
   * arquivo atual não trouxe linha nenhuma, então não há metadado novo.
   */
  sgfStatus: string | null;
  sgfUpdatedAt: string | null;
};

export type DeliverableSituation = 'novo' | 'existente' | 'sumiu';

export type ReconciledDeliverable = {
  name: string;
  /** id quando já existe; null quando será criada no commit. */
  id: string | null;
  sortOrder: number;
  situation: DeliverableSituation;
};

export type PhysicalReconcilePlan = {
  deliverables: ReconciledDeliverable[];
  activities: ReconciledActivity[];
  counts: Record<ActivitySituation, number>;
};

/**
 * Compara uma data real do Farol com a mesma data segundo o SGF e devolve o
 * estado de conciliação do campo. Usada tanto durante o import (comparando o
 * banco com o arquivo recém-lido) quanto nas telas, direto sobre as colunas
 * já persistidas (`actual_*` vs `sgf_actual_*`) — a fila de pendências do
 * dashboard e a tela de entregas recalculam isto a cada carregamento, porque
 * uma data real pode ter sido registrada direto no Farol sem nenhum import
 * ter rodado depois.
 */
export function reconcileDateField(farol: string | null, sgf: string | null): DateField {
  return resolveField(farol, sgf);
}

function resolveField(farol: string | null, sgf: string | null): DateField {
  if (farol === null && sgf === null) return { farol, sgf, state: 'vazio' };
  if (farol !== null && sgf === null) return { farol, sgf, state: 'pendente_sgf' };
  if (farol === null && sgf !== null) return { farol, sgf, state: 'absorvido' };
  if (farol === sgf) return { farol, sgf, state: 'reconciliado' };
  return { farol, sgf, state: 'divergente' };
}

/**
 * Valor vigente de uma data real após a conciliação — usado para derivar o
 * status e é o que o commit do import grava na coluna `actual_*`.
 *
 * NUNCA regride o que já está no Farol: no caso divergente, prevalece o
 * valor do Farol (o import não resolve a divergência sozinho); no pendente
 * também prevalece o Farol (o SGF ainda não tem nada); só no absorvido o
 * valor muda, e mesmo assim é porque o Farol não tinha nada ali — é um
 * preenchimento, não uma substituição.
 */
export function resolveActualValue(field: DateField): string | null {
  if (field.state === 'vazio') return null;
  if (field.state === 'absorvido') return field.sgf;
  return field.farol; // pendente_sgf, reconciliado, divergente
}

function deriveStatus(actualStart: string | null, actualEnd: string | null): PhysicalStatus {
  if (actualEnd) return 'concluido';
  if (actualStart) return 'em_andamento';
  return 'nao_iniciado';
}

const SITUATION_PRIORITY: Array<'divergente' | 'pendente_sgf' | 'absorvido'> = [
  'divergente',
  'pendente_sgf',
  'absorvido',
];

function overallSituation(start: FieldState, end: FieldState): ActivitySituation {
  for (const s of SITUATION_PRIORITY) {
    if (start === s || end === s) return s;
  }
  return 'reconciliado';
}

function emptyCounts(): Record<ActivitySituation, number> {
  return { novo: 0, reconciliado: 0, pendente_sgf: 0, absorvido: 0, divergente: 0, sumiu: 0 };
}

function buildActivity(args: {
  row: Pick<ParsedActivity, 'deliverableName' | 'name' | 'responsible' | 'plannedStart' | 'plannedEnd'>;
  importKey: string;
  sortOrder: number;
  existing: ExistingActivity | undefined;
  deliverableId: string | null;
  sgfActualStart: string | null;
  sgfActualEnd: string | null;
  sgfStatus: string | null;
  sgfUpdatedAt: string | null;
  forcedSituation?: ActivitySituation;
}): ReconciledActivity {
  const { row, existing } = args;
  const actualStart = resolveField(existing?.actualStart ?? null, args.sgfActualStart);
  const actualEnd = resolveField(existing?.actualEnd ?? null, args.sgfActualEnd);

  const situation: ActivitySituation =
    args.forcedSituation ??
    (existing ? overallSituation(actualStart.state, actualEnd.state) : 'novo');

  return {
    importKey: args.importKey,
    activityId: existing?.id ?? null,
    deliverableName: row.deliverableName,
    deliverableId: existing?.deliverableId ?? args.deliverableId,
    name: row.name,
    responsible: row.responsible,
    plannedStart: row.plannedStart,
    plannedEnd: row.plannedEnd,
    actualStart,
    actualEnd,
    status: deriveStatus(resolveActualValue(actualStart), resolveActualValue(actualEnd)),
    situation,
    sortOrder: args.sortOrder,
    sgfStatus: args.sgfStatus,
    sgfUpdatedAt: args.sgfUpdatedAt,
  };
}

/**
 * Concilia o que o arquivo do SGF diz com o que o Farol já tem gravado.
 *
 * Casamento por `importKey`. Datas previstas sempre vêm do arquivo (um
 * replanejamento é legítimo); datas reais gravadas no Farol NUNCA são
 * sobrescritas pelo import — é essa garantia que sustenta o módulo inteiro
 * (ver comentários em `physical-import.ts` e na migração 0008).
 */
export function reconcilePhysical(
  parsed: PhysicalParseResult,
  context: ReconcileContext,
): PhysicalReconcilePlan {
  const existingActivityByKey = new Map(context.existingActivities.map((a) => [a.importKey, a]));
  const existingDeliverableByName = new Map(
    context.existingDeliverables.map((d) => [d.name, d]),
  );

  const counts = emptyCounts();
  const seenKeys = new Set<string>();

  const activities: ReconciledActivity[] = parsed.activities.map((row) => {
    seenKeys.add(row.importKey);
    const existing = existingActivityByKey.get(row.importKey);
    const deliverable = existingDeliverableByName.get(row.deliverableName);

    const result = buildActivity({
      row,
      importKey: row.importKey,
      sortOrder: row.sortOrder,
      existing,
      deliverableId: deliverable?.id ?? null,
      sgfActualStart: row.sgfActualStart,
      sgfActualEnd: row.sgfActualEnd,
      sgfStatus: row.sgfStatus,
      sgfUpdatedAt: row.sgfUpdatedAt,
    });
    counts[result.situation] += 1;
    return result;
  });

  // Sumiu: existia no banco, não veio no arquivo desta vez. Marcada, nunca
  // apagada — pode carregar comentários e histórico. Mantém a posição
  // original (sortOrder do próprio registro existente), em vez de jogar o
  // item pro fim da lista.
  for (const existing of context.existingActivities) {
    if (seenKeys.has(existing.importKey)) continue;
    const result = buildActivity({
      row: existing,
      importKey: existing.importKey,
      sortOrder: existing.sortOrder,
      existing,
      deliverableId: existing.deliverableId,
      sgfActualStart: null,
      sgfActualEnd: null,
      sgfStatus: null,
      sgfUpdatedAt: null,
      forcedSituation: 'sumiu',
    });
    counts.sumiu += 1;
    activities.push(result);
  }

  const seenDeliverableNames = new Set(parsed.deliverables.map((d) => d.name));
  const deliverables: ReconciledDeliverable[] = parsed.deliverables.map((d) => {
    const existing = existingDeliverableByName.get(d.name);
    return {
      name: d.name,
      id: existing?.id ?? null,
      sortOrder: d.sortOrder,
      situation: existing ? 'existente' : 'novo',
    };
  });

  let deliverableSortCursor = deliverables.length;
  for (const existing of context.existingDeliverables) {
    if (seenDeliverableNames.has(existing.name)) continue;
    deliverables.push({
      name: existing.name,
      id: existing.id,
      sortOrder: deliverableSortCursor++,
      situation: 'sumiu',
    });
  }

  return { deliverables, activities, counts };
}

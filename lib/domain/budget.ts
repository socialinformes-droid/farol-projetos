export type AlertStatus = 'ok' | 'aviso' | 'violacao';
export type EntryKind = 'despesa' | 'baixa' | 'manual';

export type ProjectInput = {
  totalBudget: number;
  transferLimitPct: number;
  warningThresholdPct: number;
};

export type LineInput = {
  id: string;
  parentId: string | null;
  code: string | null;
  name: string;
  budgetedAmount: number | null;
  sortOrder: number;
};

export type EntryInput = {
  budgetLineId: string | null;
  amount: number;
  kind: EntryKind;
};

export type LineResult = {
  id: string;
  code: string | null;
  name: string;
  budgeted: number | null;
  /** Realizado próprio + de todos os descendentes. Exclui baixas. */
  realized: number;
  /** null quando a rubrica não tem orçamento definido. */
  balance: number | null;
  /** max(0, realizado − orçado). Zero em rubrica sem orçamento. */
  excess: number;
  /** Percentual de execução, ou null sem orçamento. */
  executionPct: number | null;
  /** True quando budgeted !== null — é onde o excesso é medido. */
  isControl: boolean;
  children: LineResult[];
};

export type ProjectSummary = {
  totalBudget: number;
  realized: number;
  available: number;
  /**
   * Quanto do orçamento total já foi executado, em percentual. Diferente de
   * `capUsagePct`, que mede o consumo do teto de remanejamento: um projeto
   * pode estar com 90% do orçamento gasto e 0% do teto consumido, se nenhuma
   * rubrica estourou o próprio valor.
   *
   * Zero quando o orçamento total é zero, para não dividir por zero.
   */
  executionPct: number;
  transferred: number;
  transferCap: number;
  capUsagePct: number;
  writeoffs: number;
  unclassifiedTotal: number;
  linesWithoutBudget: number;
  overBudget: boolean;
  status: AlertStatus;
  lines: LineResult[];
};

/** Arredonda a 2 casas evitando o resíduo binário de somas de float. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function sortLines(a: LineInput, b: LineInput): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return (a.code ?? a.name).localeCompare(b.code ?? b.name, 'pt-BR');
}

export function summarizeProject(
  project: ProjectInput,
  lines: LineInput[],
  entries: EntryInput[],
): ProjectSummary {
  // Realizado próprio de cada rubrica. Baixas ficam de fora.
  const ownRealized = new Map<string, number>();
  let writeoffs = 0;
  let unclassifiedTotal = 0;

  for (const e of entries) {
    if (e.kind === 'baixa') {
      writeoffs += e.amount;
      continue;
    }
    if (e.budgetLineId === null) {
      unclassifiedTotal += e.amount;
      continue;
    }
    ownRealized.set(e.budgetLineId, (ownRealized.get(e.budgetLineId) ?? 0) + e.amount);
  }

  const byParent = new Map<string | null, LineInput[]>();
  for (const l of lines) {
    const bucket = byParent.get(l.parentId) ?? [];
    bucket.push(l);
    byParent.set(l.parentId, bucket);
  }

  let transferred = 0;
  let linesWithoutBudget = 0;
  let classifiedRealized = 0;

  function build(input: LineInput): LineResult {
    const children = (byParent.get(input.id) ?? []).sort(sortLines).map(build);
    const own = ownRealized.get(input.id) ?? 0;
    const realized = round2(own + children.reduce((acc, c) => acc + c.realized, 0));
    const budgeted = input.budgetedAmount;
    const isControl = budgeted !== null;

    // Só o realizado próprio entra no total do projeto; o do filho já foi somado
    // quando o filho foi construído. Isso evita dupla contagem na hierarquia.
    classifiedRealized += own;

    let excess = 0;
    if (isControl) {
      excess = round2(Math.max(0, realized - budgeted));
      transferred += excess;
    } else if (realized > 0) {
      linesWithoutBudget += 1;
    }

    return {
      id: input.id,
      code: input.code,
      name: input.name,
      budgeted,
      realized,
      balance: isControl ? round2(budgeted - realized) : null,
      excess,
      executionPct: isControl && budgeted > 0 ? round2((realized / budgeted) * 100) : null,
      isControl,
      children,
    };
  }

  const tree = (byParent.get(null) ?? []).sort(sortLines).map(build);

  const realized = round2(classifiedRealized + unclassifiedTotal);
  const transferCap = round2((project.totalBudget * project.transferLimitPct) / 100);
  transferred = round2(transferred);

  let capUsagePct: number;
  if (transferCap > 0) {
    capUsagePct = round2((transferred / transferCap) * 100);
  } else {
    // Sem teto configurado, qualquer remanejamento já é violação.
    capUsagePct = transferred > 0 ? 100 : 0;
  }

  const overBudget = realized > project.totalBudget;
  const violated = transferred > transferCap || overBudget;

  let status: AlertStatus = 'ok';
  if (violated) status = 'violacao';
  else if (capUsagePct >= project.warningThresholdPct) status = 'aviso';

  return {
    totalBudget: project.totalBudget,
    realized,
    available: round2(project.totalBudget - realized),
    executionPct:
      project.totalBudget > 0 ? round2((realized / project.totalBudget) * 100) : 0,
    transferred,
    transferCap,
    capUsagePct,
    writeoffs: round2(writeoffs),
    unclassifiedTotal: round2(unclassifiedTotal),
    linesWithoutBudget,
    overBudget,
    status,
    lines: tree,
  };
}

import type { ProjectRow, BudgetLineRow, LedgerEntryRow } from '@/lib/supabase/types';

export function toProjectInput(row: ProjectRow): ProjectInput {
  return {
    totalBudget: Number(row.total_budget),
    transferLimitPct: Number(row.transfer_limit_pct),
    warningThresholdPct: Number(row.warning_threshold_pct),
  };
}

export function toLineInput(row: BudgetLineRow): LineInput {
  return {
    id: row.id,
    parentId: row.parent_id,
    code: row.code,
    name: row.name,
    budgetedAmount: row.budgeted_amount === null ? null : Number(row.budgeted_amount),
    sortOrder: row.sort_order,
  };
}

export function toEntryInput(row: LedgerEntryRow): EntryInput {
  return {
    budgetLineId: row.budget_line_id,
    amount: Number(row.amount),
    kind: row.kind,
  };
}

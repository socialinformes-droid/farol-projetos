import type { ParsedEntry } from './ledger-import';

export type ResolutionContext = {
  /** Indexado pelo código do centro de custo. */
  projectsByCode: Record<string, { id: string; name: string }>;
  /** Rubricas já cadastradas, por projeto. */
  budgetLinesByProject: Record<string, { id: string; code: string | null }[]>;
  /** Chaves 'voucher|journal' já importadas, por projeto. */
  existingKeysByProject: Record<string, string[]>;
};

export type NewBudgetLine = { code: string; name: string };

export type PlannedEntry = ParsedEntry & {
  /** Código da conta que resolve a rubrica. Pode apontar para rubrica ainda a criar. */
  budgetLineCode: string;
  /** id da rubrica quando ela já existe; null quando será criada no commit. */
  budgetLineId: string | null;
};

export type ProjectPlan = {
  projectId: string;
  projectName: string;
  centerCode: string;
  newEntries: PlannedEntry[];
  newBudgetLines: NewBudgetLine[];
  duplicateCount: number;
  unmappedCount: number;
  expenseTotal: number;
  writeoffTotal: number;
};

export type UnknownCenter = {
  code: string;
  name: string;
  count: number;
  total: number;
};

export type ImportPlan = {
  projects: ProjectPlan[];
  unknownCenters: UnknownCenter[];
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Chave de idempotência. null quando o razão não trouxe identificação. */
function importKey(entry: ParsedEntry): string | null {
  if (!entry.voucher && !entry.journal) return null;
  return `${entry.voucher ?? ''}|${entry.journal ?? ''}`;
}

export function resolveImport(
  entries: ParsedEntry[],
  context: ResolutionContext,
): ImportPlan {
  const plans = new Map<string, ProjectPlan>();
  const seenKeys = new Map<string, Set<string>>();
  const unknown = new Map<string, UnknownCenter>();

  for (const entry of entries) {
    const project = context.projectsByCode[entry.costCenterCode];

    if (!project) {
      const current = unknown.get(entry.costCenterCode) ?? {
        code: entry.costCenterCode,
        name: entry.costCenterName,
        count: 0,
        total: 0,
      };
      current.count += 1;
      current.total = round2(current.total + entry.amount);
      unknown.set(entry.costCenterCode, current);
      continue;
    }

    let plan = plans.get(project.id);
    if (!plan) {
      plan = {
        projectId: project.id,
        projectName: project.name,
        centerCode: entry.costCenterCode,
        newEntries: [],
        newBudgetLines: [],
        duplicateCount: 0,
        unmappedCount: 0,
        expenseTotal: 0,
        writeoffTotal: 0,
      };
      plans.set(project.id, plan);
      seenKeys.set(
        project.id,
        new Set(context.existingKeysByProject[project.id] ?? []),
      );
    }

    const key = importKey(entry);
    const seen = seenKeys.get(project.id)!;
    if (key !== null && seen.has(key)) {
      plan.duplicateCount += 1;
      continue;
    }
    if (key !== null) seen.add(key);

    const existingLine = (context.budgetLinesByProject[project.id] ?? []).find(
      (l) => l.code === entry.accountCode,
    );

    if (!existingLine) {
      plan.unmappedCount += 1;
      if (!plan.newBudgetLines.some((l) => l.code === entry.accountCode)) {
        plan.newBudgetLines.push({ code: entry.accountCode, name: entry.accountName });
      }
    }

    if (entry.kind === 'baixa') {
      plan.writeoffTotal = round2(plan.writeoffTotal + entry.amount);
    } else {
      plan.expenseTotal = round2(plan.expenseTotal + entry.amount);
    }

    plan.newEntries.push({
      ...entry,
      budgetLineCode: entry.accountCode,
      budgetLineId: existingLine?.id ?? null,
    });
  }

  return {
    projects: [...plans.values()],
    unknownCenters: [...unknown.values()],
  };
}

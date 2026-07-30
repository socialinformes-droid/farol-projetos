import { createHash } from 'node:crypto';
import type { ParsedEntry } from './ledger-import';

export type ResolutionContext = {
  /** Indexado pelo código do centro de custo. */
  projectsByCode: Record<string, { id: string; name: string }>;
  /** Rubricas já cadastradas, por projeto. */
  budgetLinesByProject: Record<string, { id: string; code: string | null; name: string }[]>;
  /** Valores de `import_key` já gravados, por projeto. */
  existingKeysByProject: Record<string, string[]>;
  /** Mapeamento conta do razão -> rubrica, por projeto. Ver migração 0012. */
  mappingsByProject: Record<string, { accountCode: string; budgetLineId: string }[]>;
};

/** Conta do razão sem rubrica correspondente — precisa de uma decisão (rubrica existente ou nova). */
export type UnmappedAccount = { code: string; name: string };

export type PlannedEntry = ParsedEntry & {
  /** Código da conta que resolve a rubrica. Pode apontar para rubrica ainda a criar. */
  budgetLineCode: string;
  /** id da rubrica quando ela já existe; null quando será criada no commit. */
  budgetLineId: string | null;
  /** Hash de idempotência gravado em ledger_entries.import_key. */
  importKey: string | null;
};

export type ProjectPlan = {
  projectId: string;
  projectName: string;
  centerCode: string;
  newEntries: PlannedEntry[];
  /** Contas sem rubrica correspondente — a UI de import decide o destino de cada uma. */
  unmappedAccounts: UnmappedAccount[];
  /** Rubricas já cadastradas do projeto — a UI usa para montar o seletor de resolução. */
  existingBudgetLines: { id: string; code: string | null; name: string }[];
  duplicateCount: number;
  unmappedCount: number;
  expenseTotal: number;
  /** Total de aportes recebidos no arquivo, positivo. */
  contributionTotal: number;
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

/**
 * Chave de idempotência do lançamento no razão.
 *
 * Comprovante+Diário NÃO bastam: um documento cobre várias linhas. No arquivo
 * real o CONTAB000200813 tem 9 linhas, duas com a mesma conta e o mesmo valor
 * (R$ 7.795,41 em Passagens), separadas só pela descrição — NF 180785 contra
 * NF 180789, lançamentos legítimos e distintos. Usar só o par descartava 9 das
 * 33 linhas como duplicadas e perdia R$ 12.861,41 em silêncio.
 *
 * Somando conta, valor, data e descrição, as 33 linhas do arquivo real geram
 * 33 chaves distintas. O hash mantém a entrada do índice em 64 caracteres —
 * as descrições passam de 200 e um btree tem limite de 2704 bytes.
 *
 * Devolve null quando o razão não trouxe identificação alguma; nesse caso o
 * lançamento nunca é tratado como duplicado.
 */
function importKey(entry: ParsedEntry): string | null {
  if (!entry.voucher && !entry.journal) return null;
  const parts = [
    entry.voucher ?? '',
    entry.journal ?? '',
    entry.accountCode,
    entry.amount.toFixed(2),
    entry.entryDate,
    entry.description ?? '',
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
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
        unmappedAccounts: [],
        existingBudgetLines: context.budgetLinesByProject[project.id] ?? [],
        duplicateCount: 0,
        unmappedCount: 0,
        expenseTotal: 0,
        contributionTotal: 0,
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

    // Aporte é entrada de recurso, não gasto: não pertence a rubrica nenhuma.
    // Criar uma rubrica para a conta de receita poluiria a tela de orçamento e
    // o gráfico com uma linha que nunca terá valor orçado.
    const isAporte = entry.kind === 'aporte';

    // Resolução em duas etapas: primeiro o mapeamento salvo (migração 0012),
    // que é o caminho normal depois que o projeto já resolveu essa conta uma
    // vez; o casamento direto por `budget_lines.code` é só compatibilidade
    // com projetos que já dependiam dele antes de o mapeamento existir.
    const mapping = isAporte
      ? undefined
      : (context.mappingsByProject[project.id] ?? []).find(
          (m) => m.accountCode === entry.accountCode,
        );

    const existingLine = isAporte
      ? undefined
      : mapping
        ? { id: mapping.budgetLineId }
        : (context.budgetLinesByProject[project.id] ?? []).find(
            (l) => l.code === entry.accountCode,
          );

    if (!isAporte && !existingLine) {
      plan.unmappedCount += 1;
      if (!plan.unmappedAccounts.some((l) => l.code === entry.accountCode)) {
        plan.unmappedAccounts.push({ code: entry.accountCode, name: entry.accountName });
      }
    }

    if (isAporte) {
      // Sinal invertido: o razão lança o aporte como crédito negativo.
      plan.contributionTotal = round2(plan.contributionTotal + Math.abs(entry.amount));
    } else {
      plan.expenseTotal = round2(plan.expenseTotal + entry.amount);
    }

    plan.newEntries.push({
      ...entry,
      budgetLineCode: entry.accountCode,
      budgetLineId: existingLine?.id ?? null,
      importKey: key,
    });
  }

  return {
    projects: [...plans.values()],
    unknownCenters: [...unknown.values()],
  };
}

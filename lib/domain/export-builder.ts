import type { ProjectSummary, LineResult } from './budget';
import type { ProjectRow, LedgerEntryRow } from '@/lib/supabase/types';

export type SheetCell = string | number;
export type Sheet = SheetCell[][];

const KIND_LABEL: Record<string, string> = {
  despesa: 'Despesa',
  baixa: 'Baixa de projeto',
  manual: 'Manual',
};

export function buildSummarySheet(_project: ProjectRow, summary: ProjectSummary): Sheet {
  const rows: Sheet = [
    ['Código', 'Rubrica', 'Orçado', 'Realizado', 'Saldo', 'Excesso', '% Execução'],
  ];

  function walk(line: LineResult, depth: number): void {
    rows.push([
      line.code ?? '',
      `${'  '.repeat(depth)}${line.name}`,
      line.budgeted ?? '',
      line.realized,
      line.balance ?? '',
      line.excess,
      line.executionPct ?? '',
    ]);
    for (const child of line.children) walk(child, depth + 1);
  }

  for (const line of summary.lines) walk(line, 0);

  if (summary.unclassifiedTotal !== 0) {
    rows.push(['', 'Sem rubrica', '', summary.unclassifiedTotal, '', 0, '']);
  }

  rows.push([
    '',
    'TOTAL',
    summary.totalBudget,
    summary.realized,
    summary.available,
    summary.transferred,
    '',
  ]);

  return rows;
}

export function buildIndicatorsSheet(project: ProjectRow, summary: ProjectSummary): Sheet {
  return [
    ['Indicador', 'Valor'],
    ['Projeto', project.name],
    ['Centro de custo', project.code],
    ['Orçamento total', summary.totalBudget],
    ['Realizado', summary.realized],
    ['Saldo disponível', summary.available],
    ['Remanejado entre rubricas', summary.transferred],
    ['Teto de remanejamento', summary.transferCap],
    ['Consumo do teto (%)', summary.capUsagePct],
    ['Baixas de projeto', summary.writeoffs],
    ['Rubricas sem orçamento', summary.linesWithoutBudget],
  ];
}

export function buildEntriesSheet(
  entries: LedgerEntryRow[],
  lineNames: Map<string, string>,
): Sheet {
  const rows: Sheet = [
    [
      'Data', 'Rubrica', 'Conta', 'Descrição', 'Fornecedor', 'CNPJ/CPF', 'Valor',
      'Tipo', 'Origem', 'Comprovante', 'Diário', 'Nota fiscal', 'URL comprovante', 'Observações',
    ],
  ];

  for (const e of entries) {
    rows.push([
      e.entry_date,
      e.budget_line_id === null
        ? 'Sem rubrica'
        : lineNames.get(e.budget_line_id) ?? 'Sem rubrica',
      e.account_code ? `${e.account_code} - ${e.account_name ?? ''}`.trim() : '',
      e.description ?? '',
      e.vendor_name ?? '',
      e.vendor_doc ?? '',
      Number(e.amount),
      KIND_LABEL[e.kind] ?? e.kind,
      e.source === 'import' ? 'Importado' : 'Manual',
      e.voucher ?? '',
      e.journal ?? '',
      e.urls?.nota_fiscal ?? '',
      e.urls?.comprovante ?? '',
      e.notes ?? '',
    ]);
  }

  return rows;
}

import { describe, it, expect } from 'vitest';
import { buildSummarySheet, buildIndicatorsSheet, buildEntriesSheet } from './export-builder';
import type { ProjectSummary, LineResult } from './budget';
import type { ProjectRow, LedgerEntryRow } from '@/lib/supabase/types';

function line(over: Partial<LineResult>): LineResult {
  return {
    id: 'l1',
    code: '31010401001',
    name: 'Passagens Nacionais',
    budgeted: 45000,
    realized: 40959.65,
    balance: 4040.35,
    excess: 0,
    executionPct: 91.02,
    isControl: true,
    children: [],
    ...over,
  };
}

const project = {
  id: 'p1',
  code: '30413070101',
  name: 'Estruturante 2026',
  total_budget: '100000.00',
} as ProjectRow;

const summary: ProjectSummary = {
  totalBudget: 100000,
  realized: 48419.11,
  available: 51580.89,
  executionPct: 48.42,
  transferred: 2000,
  transferCap: 25000,
  capUsagePct: 8,
  contributions: 41156.24,
  cashBalance: -7262.87,
  fundingModel: 'reembolso',
  budgetControl: 'por_rubrica',
  unclassifiedTotal: 0,
  linesWithoutBudget: 1,
  overBudget: false,
  status: 'ok',
  lines: [line({})],
};

describe('buildSummarySheet', () => {
  it('começa pelo cabeçalho esperado', () => {
    const sheet = buildSummarySheet(project, summary);
    expect(sheet[0]).toEqual([
      'Código', 'Rubrica', 'Orçado', 'Realizado', 'Saldo', 'Excesso', '% Execução',
    ]);
  });

  it('escreve a rubrica com valores numéricos, não formatados', () => {
    const sheet = buildSummarySheet(project, summary);
    expect(sheet[1]).toEqual([
      '31010401001', 'Passagens Nacionais', 45000, 40959.65, 4040.35, 0, 91.02,
    ]);
  });

  it('indenta a filha e a coloca logo depois do pai', () => {
    const comFilha: ProjectSummary = {
      ...summary,
      lines: [
        line({
          id: 'pai',
          code: null,
          name: 'Deslocamento',
          children: [line({ id: 'f1', name: 'Passagens Nacionais', budgeted: null, balance: null, executionPct: null, isControl: false })],
        }),
      ],
    };
    const sheet = buildSummarySheet(project, comFilha);
    expect(sheet[1][1]).toBe('Deslocamento');
    expect(sheet[2][1]).toBe('  Passagens Nacionais');
  });

  it('deixa vazio, e não zero, o que não tem orçamento', () => {
    const semOrcamento: ProjectSummary = {
      ...summary,
      lines: [line({ budgeted: null, balance: null, executionPct: null, isControl: false })],
    };
    const sheet = buildSummarySheet(project, semOrcamento);
    expect(sheet[1][2]).toBe('');
    expect(sheet[1][4]).toBe('');
    expect(sheet[1][6]).toBe('');
  });

  it('fecha com a linha de total', () => {
    const sheet = buildSummarySheet(project, summary);
    expect(sheet[sheet.length - 1]).toEqual(['', 'TOTAL', 100000, 48419.11, 51580.89, 2000, '']);
  });
});

describe('buildIndicatorsSheet', () => {
  it('traz os indicadores com rótulo e valor', () => {
    const sheet = buildIndicatorsSheet(project, summary);
    expect(sheet[0]).toEqual(['Indicador', 'Valor']);
    expect(sheet).toContainEqual(['Orçamento total', 100000]);
    expect(sheet).toContainEqual(['Realizado', 48419.11]);
    expect(sheet).toContainEqual(['Saldo disponível', 51580.89]);
    expect(sheet).toContainEqual(['Execução do orçamento (%)', 48.42]);
    expect(sheet).toContainEqual(['Remanejado entre rubricas', 2000]);
    expect(sheet).toContainEqual(['Teto de remanejamento', 25000]);
    expect(sheet).toContainEqual(['Consumo do teto (%)', 8]);
    expect(sheet).toContainEqual(['Aportes recebidos', 41156.24]);
  });
});

describe('buildEntriesSheet', () => {
  const entry = {
    entry_date: '2026-04-30',
    budget_line_id: 'l1',
    account_code: '31010401001',
    account_name: 'Passagens Nacionais',
    description: 'Compra referente NF 000000',
    vendor_name: 'FORNECEDOR EXEMPLO LTDA',
    vendor_doc: '00.000.000/0001-00',
    amount: '7795.41',
    kind: 'despesa',
    source: 'import',
    voucher: 'CONTAB000197595',
    journal: '2-02104071',
    urls: { nota_fiscal: null, comprovante: 'https://exemplo.invalid/c' },
    notes: 'Aguardando nota fiscal do fornecedor',
  } as LedgerEntryRow;

  it('termina o cabeçalho com a coluna Observações', () => {
    const sheet = buildEntriesSheet([entry], new Map([['l1', 'Passagens Nacionais']]));
    expect(sheet[0][sheet[0].length - 1]).toBe('Observações');
  });

  it('resolve o nome da rubrica pelo mapa', () => {
    const sheet = buildEntriesSheet([entry], new Map([['l1', 'Passagens Nacionais']]));
    expect(sheet[1][1]).toBe('Passagens Nacionais');
    expect(sheet[1][6]).toBe(7795.41);
  });

  it('escreve "Sem rubrica" quando não há classificação', () => {
    const sheet = buildEntriesSheet(
      [{ ...entry, budget_line_id: null }],
      new Map(),
    );
    expect(sheet[1][1]).toBe('Sem rubrica');
  });

  it('carrega a observação na última coluna', () => {
    const sheet = buildEntriesSheet([entry], new Map([['l1', 'Passagens Nacionais']]));
    expect(sheet[1][sheet[1].length - 1]).toBe('Aguardando nota fiscal do fornecedor');
  });

  it('deixa a coluna de observações vazia quando não há nota', () => {
    const sheet = buildEntriesSheet([{ ...entry, notes: null }], new Map([['l1', 'Passagens Nacionais']]));
    expect(sheet[1][sheet[1].length - 1]).toBe('');
  });
});

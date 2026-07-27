import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadProjectSummary } from '@/lib/domain/project-queries';
import { buildSummarySheet, buildIndicatorsSheet, buildEntriesSheet, type Sheet } from '@/lib/domain/export-builder';
import type { LineResult } from '@/lib/domain/budget';
import type { LedgerEntryRow } from '@/lib/supabase/types';
import { toISODate } from '@/lib/format';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CURRENCY_FORMAT = 'R$ #,##0.00';

/** Rótulos do "Indicador" que representam valores monetários, na aba Indicadores. */
const MONEY_LABELS = new Set([
  'Orçamento total',
  'Realizado',
  'Saldo disponível',
  'Remanejado entre rubricas',
  'Teto de remanejamento',
  'Baixas de projeto',
]);

/** Achata a árvore de rubricas num mapa id -> nome, para a aba Lançamentos. */
function flattenLineNames(lines: LineResult[]): Map<string, string> {
  const map = new Map<string, string>();
  function walk(line: LineResult) {
    map.set(line.id, line.name);
    for (const child of line.children) walk(child);
  }
  for (const line of lines) walk(line);
  return map;
}

function csvEscape(value: string): string {
  if (/[";\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsv(sheet: Sheet): string {
  const lines = sheet.map((row) =>
    row
      .map((cell) =>
        typeof cell === 'number' ? cell.toString().replace('.', ',') : csvEscape(cell),
      )
      .join(';'),
  );
  return `﻿${lines.join('\r\n')}\r\n`;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get('projeto');
  const formato = searchParams.get('formato');

  if (!projectId) {
    return NextResponse.json({ error: 'Informe o parâmetro "projeto".' }, { status: 400 });
  }
  if (formato !== 'xlsx' && formato !== 'csv') {
    return NextResponse.json(
      { error: 'Formato inválido. Use "xlsx" ou "csv".' },
      { status: 400 },
    );
  }

  const result = await loadProjectSummary(projectId);
  if (!result) {
    return NextResponse.json({ error: 'Projeto não encontrado.' }, { status: 404 });
  }
  const { project, summary } = result;

  const summarySheet = buildSummarySheet(project, summary);
  const hoje = toISODate(new Date());
  const filenameBase = `farol-${project.code}-${hoje}`;

  if (formato === 'csv') {
    return new NextResponse(toCsv(summarySheet), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filenameBase}.csv"`,
      },
    });
  }

  const supabase = createAdminClient();
  const { data: entries, error } = await supabase
    .from('ledger_entries')
    .select('*')
    .eq('project_id', projectId)
    .order('entry_date', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const lineNames = flattenLineNames(summary.lines);
  const entriesSheet = buildEntriesSheet((entries ?? []) as LedgerEntryRow[], lineNames);
  const indicatorsSheet = buildIndicatorsSheet(project, summary);

  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Farol de Projetos';
  workbook.created = new Date();

  addSheet(workbook, 'Resumo', summarySheet, [2, 3, 4, 5]);
  addSheet(workbook, 'Lançamentos', entriesSheet, [6]);
  addIndicatorsSheet(workbook, indicatorsSheet);

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filenameBase}.xlsx"`,
    },
  });
}

/** Escreve uma aba a partir da matriz, com cabeçalho em negrito, moeda nas
 * colunas indicadas (índices 0-based) e largura de coluna ajustada ao conteúdo. */
function addSheet(
  workbook: import('exceljs').Workbook,
  name: string,
  sheet: Sheet,
  currencyColumns: number[],
): void {
  const worksheet = workbook.addWorksheet(name);
  const [header, ...rows] = sheet;

  worksheet.addRow(header);
  worksheet.getRow(1).font = { bold: true };
  for (const row of rows) worksheet.addRow(row);

  for (const col of currencyColumns) {
    worksheet.getColumn(col + 1).numFmt = CURRENCY_FORMAT;
  }

  autoFitColumns(worksheet, sheet);
}

/** Aba Indicadores: só as linhas de "Indicador" reconhecidas como monetárias
 * ganham o formato de moeda — as demais (nome do projeto, percentuais,
 * contagens) ficam com o valor cru. */
function addIndicatorsSheet(workbook: import('exceljs').Workbook, sheet: Sheet): void {
  const worksheet = workbook.addWorksheet('Indicadores');
  const [header, ...rows] = sheet;

  worksheet.addRow(header);
  worksheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    const excelRow = worksheet.addRow(row);
    const label = row[0];
    if (typeof label === 'string' && MONEY_LABELS.has(label)) {
      excelRow.getCell(2).numFmt = CURRENCY_FORMAT;
    }
  }

  autoFitColumns(worksheet, sheet);
}

function autoFitColumns(
  worksheet: import('exceljs').Worksheet,
  sheet: Sheet,
): void {
  const columnCount = sheet[0]?.length ?? 0;
  for (let i = 0; i < columnCount; i += 1) {
    const maxLen = sheet.reduce((max, row) => {
      const cell = row[i];
      const len = cell === undefined || cell === '' ? 0 : String(cell).length;
      return Math.max(max, len);
    }, 0);
    worksheet.getColumn(i + 1).width = Math.min(Math.max(maxLen + 2, 10), 45);
  }
}

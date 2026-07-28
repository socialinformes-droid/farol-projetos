import { createHash } from 'node:crypto';

export const PHYSICAL_HEADERS = [
  'Entrega',
  'Atividade',
  'Tarefa',
  'Responsável',
  'Data Início',
  'Data Fim',
  '% de Realização',
  'Data Real do Início',
  'Data Real da Finalização',
  'Status',
  'Data da Atualização',
] as const;

export type ParsedActivity = {
  deliverableName: string;
  name: string;
  responsible: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  sgfActualStart: string | null;
  sgfActualEnd: string | null;
  sgfStatus: string | null;
  sgfUpdatedAt: string | null;
  importKey: string;
  sortOrder: number;
};

export type ParsedDeliverable = {
  name: string;
  sortOrder: number;
  activityCount: number;
};

export type PhysicalParseResult = {
  deliverables: ParsedDeliverable[];
  activities: ParsedActivity[];
  discardedRows: number;
};

/** 'dd/MM/yyyy' -> 'yyyy-MM-dd'. Devolve null se não casar. */
function parseBRDate(value: string): string | null {
  const m = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function nullIfEmpty(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Chave de idempotência da atividade: hash de deliverableName + '|' + name.
 *
 * Datas NÃO entram na chave de propósito. O cronograma do SGF é replanejado
 * com frequência — a mesma atividade muda de Data Início/Fim ao longo do
 * projeto. Se a data fizesse parte da chave, um replanejamento faria a
 * atividade chegar como "nova" no próximo import, desligando-a de qualquer
 * comentário ou data real já registrada aqui — exatamente o que este módulo
 * existe para preservar. Por isso a chave depende só de entrega + atividade,
 * que juntas já identificam a linha de forma estável (30 chaves distintas
 * para as 30 linhas do arquivo real, embora o nome da atividade sozinho
 * colida em duas entregas diferentes).
 */
function importKey(deliverableName: string, activityName: string): string {
  return createHash('sha256')
    .update(`${deliverableName}|${activityName}`)
    .digest('hex');
}

export function parsePhysicalRows(rows: string[][]): PhysicalParseResult {
  if (rows.length === 0) {
    throw new Error('A planilha está vazia.');
  }

  const header = rows[0].map((h) => h.trim());
  const missing = PHYSICAL_HEADERS.filter((h) => !header.includes(h));
  if (missing.length > 0) {
    throw new Error(
      `A planilha não parece ser o relatório de cronograma físico do SGF. Colunas ausentes: ${missing.join(', ')}.`,
    );
  }

  const at = (row: string[], column: (typeof PHYSICAL_HEADERS)[number]): string =>
    (row[header.indexOf(column)] ?? '').toString();

  const activities: ParsedActivity[] = [];
  let discardedRows = 0;
  let currentDeliverable = '';

  const deliverableOrder: string[] = [];
  const deliverableCounts = new Map<string, number>();

  for (const row of rows.slice(1)) {
    const entregaCell = at(row, 'Entrega').trim();
    if (entregaCell !== '') {
      currentDeliverable = entregaCell;
    }

    const activityName = at(row, 'Atividade').trim();
    if (activityName === '') {
      discardedRows += 1;
      continue;
    }

    if (!deliverableCounts.has(currentDeliverable)) {
      deliverableOrder.push(currentDeliverable);
      deliverableCounts.set(currentDeliverable, 0);
    }
    deliverableCounts.set(currentDeliverable, deliverableCounts.get(currentDeliverable)! + 1);

    activities.push({
      deliverableName: currentDeliverable,
      name: activityName,
      responsible: nullIfEmpty(at(row, 'Responsável')),
      plannedStart: parseBRDate(at(row, 'Data Início')),
      plannedEnd: parseBRDate(at(row, 'Data Fim')),
      sgfActualStart: parseBRDate(at(row, 'Data Real do Início')),
      sgfActualEnd: parseBRDate(at(row, 'Data Real da Finalização')),
      sgfStatus: nullIfEmpty(at(row, 'Status')),
      sgfUpdatedAt: parseBRDate(at(row, 'Data da Atualização')),
      importKey: importKey(currentDeliverable, activityName),
      sortOrder: activities.length,
    });
  }

  const deliverables: ParsedDeliverable[] = deliverableOrder.map((name, index) => ({
    name,
    sortOrder: index,
    activityCount: deliverableCounts.get(name) ?? 0,
  }));

  return { deliverables, activities, discardedRows };
}

/**
 * Converte a aba 'Entrega' do relatório de cronograma físico-financeiro do
 * SGF numa matriz de strings.
 *
 * Duas armadilhas deste arquivo, confirmadas no arquivo real:
 *
 * 1. Apesar da extensão .xls, o conteúdo é SpreadsheetML 2003 (XML) com o
 *    prólogo declarando ISO-8859-1. O SheetJS assume UTF-8 ao ler um
 *    ArrayBuffer, então ler o buffer direto transforma "Participação" em
 *    mojibake. É preciso decodificar o texto primeiro e entregar ao SheetJS
 *    como string (type: 'string'), não como array de bytes.
 *
 * 2. A coluna Entrega só vem preenchida na primeira linha de cada grupo
 *    (célula mesclada no Excel) — as demais linhas do grupo chegam com essa
 *    coluna vazia. O preenchimento por herança acontece em
 *    parsePhysicalRows, não aqui; esta função só entrega a matriz crua.
 */
export async function readPhysicalWorkbook(buffer: ArrayBuffer): Promise<string[][]> {
  const XLSX = await import('xlsx');

  const texto = new TextDecoder('iso-8859-1').decode(buffer);
  const workbook = XLSX.read(texto, { type: 'string' });

  const sheetName = workbook.SheetNames.find((name) => name === 'Entrega');
  if (!sheetName) {
    throw new Error('A planilha não tem a aba "Entrega".');
  }

  const sheet = workbook.Sheets[sheetName];

  return XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: true,
  });
}

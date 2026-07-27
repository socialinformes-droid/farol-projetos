import type { EntryUrls } from '@/lib/supabase/types';

export const LEDGER_HEADERS = [
  'Data',
  'Entidade',
  'Filial',
  'Unidade',
  'Centro',
  'Conta',
  'Valor',
  'Comprovante',
  'Diário',
  'Data_do_Pagamento',
  'Data do Documento',
  'Descrição',
  'Texto de linha',
  'Referência',
  'CNPJ/CPF',
  'RAZÃO SOCIAL/NOME',
  'Requisição',
  'URL Requisição',
  'Recebimento',
  'URL Recebimento',
  'Documento',
  'URL Nota Fiscal',
  'URL Comprovante',
] as const;

export type ParsedEntry = {
  costCenterCode: string;
  costCenterName: string;
  accountCode: string;
  accountName: string;
  entryDate: string;
  amount: number;
  kind: 'despesa' | 'baixa';
  description: string | null;
  voucher: string | null;
  journal: string | null;
  document: string | null;
  reference: string | null;
  vendorDoc: string | null;
  vendorName: string | null;
  paymentDate: string | null;
  documentDate: string | null;
  urls: EntryUrls;
  raw: Record<string, string>;
};

export type CenterSummary = {
  code: string;
  name: string;
  count: number;
  total: number;
};

export type ParseResult = {
  entries: ParsedEntry[];
  discardedRows: number;
  centers: CenterSummary[];
};

/** Separa "31010401001 - Passagens Nacionais" no PRIMEIRO hífen. */
function splitCodeName(value: string): { code: string; name: string } {
  const idx = value.indexOf(' - ');
  if (idx === -1) return { code: value.trim(), name: '' };
  return { code: value.slice(0, idx).trim(), name: value.slice(idx + 3).trim() };
}

/** 'dd/MM/yyyy' -> 'yyyy-MM-dd'. Devolve null se não casar. */
function parseBRDate(value: string): string | null {
  const m = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * O Genus exporta valor como número (ponto decimal), mas planilhas reabertas
 * no Excel pt-BR podem sair como '1.234,56'. Aceita os dois.
 */
function parseAmount(value: string): number {
  const raw = value.trim();
  if (raw === '') return 0;
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function nullIfEmpty(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function parseLedgerRows(rows: string[][]): ParseResult {
  if (rows.length === 0) {
    throw new Error('A planilha está vazia.');
  }

  const header = rows[0].map((h) => h.trim());
  const missing = LEDGER_HEADERS.filter((h) => !header.includes(h));
  if (missing.length > 0) {
    throw new Error(
      `A planilha não parece ser o razão do Genus. Colunas ausentes: ${missing.join(', ')}.`,
    );
  }

  const at = (row: string[], column: (typeof LEDGER_HEADERS)[number]): string =>
    (row[header.indexOf(column)] ?? '').toString();

  const entries: ParsedEntry[] = [];
  let discardedRows = 0;

  for (const row of rows.slice(1)) {
    const centro = at(row, 'Centro').trim();
    // Rodapé do relatório (linha 'Total' e linha 'Filtros aplicados:') e linhas
    // em branco nunca têm centro de custo.
    if (centro === '') {
      discardedRows += 1;
      continue;
    }

    const entryDate = parseBRDate(at(row, 'Data'));
    if (entryDate === null) {
      discardedRows += 1;
      continue;
    }

    const center = splitCodeName(centro);
    const account = splitCodeName(at(row, 'Conta'));
    const amount = parseAmount(at(row, 'Valor'));

    const raw: Record<string, string> = {};
    for (const column of LEDGER_HEADERS) {
      raw[column] = at(row, column);
    }

    entries.push({
      costCenterCode: center.code,
      costCenterName: center.name,
      accountCode: account.code,
      accountName: account.name,
      entryDate,
      amount,
      // Contas do grupo 4 com valor negativo são a contrapartida contábil
      // (baixa de projeto), não despesa.
      kind: account.code.startsWith('4') && amount < 0 ? 'baixa' : 'despesa',
      description: nullIfEmpty(at(row, 'Descrição')),
      voucher: nullIfEmpty(at(row, 'Comprovante')),
      journal: nullIfEmpty(at(row, 'Diário')),
      document: nullIfEmpty(at(row, 'Documento')),
      reference: nullIfEmpty(at(row, 'Referência')),
      vendorDoc: nullIfEmpty(at(row, 'CNPJ/CPF')),
      vendorName: nullIfEmpty(at(row, 'RAZÃO SOCIAL/NOME')),
      paymentDate: parseBRDate(at(row, 'Data_do_Pagamento')),
      documentDate: parseBRDate(at(row, 'Data do Documento')),
      urls: {
        requisicao: nullIfEmpty(at(row, 'URL Requisição')),
        recebimento: nullIfEmpty(at(row, 'URL Recebimento')),
        nota_fiscal: nullIfEmpty(at(row, 'URL Nota Fiscal')),
        comprovante: nullIfEmpty(at(row, 'URL Comprovante')),
      },
      raw,
    });
  }

  const centerMap = new Map<string, CenterSummary>();
  for (const e of entries) {
    const current = centerMap.get(e.costCenterCode) ?? {
      code: e.costCenterCode,
      name: e.costCenterName,
      count: 0,
      total: 0,
    };
    current.count += 1;
    current.total = Math.round((current.total + e.amount) * 100) / 100;
    centerMap.set(e.costCenterCode, current);
  }

  return {
    entries,
    discardedRows,
    centers: [...centerMap.values()].sort((a, b) => a.code.localeCompare(b.code)),
  };
}

/**
 * Converte a primeira aba do .xlsx numa matriz de strings.
 * Só é chamado em Route Handler; não roda no browser.
 *
 * Usa SheetJS, não ExcelJS: o Genus escreve o XML interno com prefixo de
 * namespace (`<x:row>`, `<x:c>`) e sem os atributos `r=` de referência de
 * célula. É válido, mas o ExcelJS não abre essa variante — falha com
 * "Cannot read properties of undefined (reading 'sheets')". O SheetJS lê
 * sem esforço. Ver docs/superpowers/plans para o registro da decisão.
 */
export async function readWorkbookRows(buffer: ArrayBuffer): Promise<string[][]> {
  const XLSX = await import('xlsx');

  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('A planilha não tem nenhuma aba.');

  const sheet = workbook.Sheets[sheetName];

  // raw: false devolve o texto formatado da célula, então a coluna Data chega
  // como 'dd/MM/yyyy' e parseBRDate a entende. Com raw: true viria o serial
  // numérico do Excel e todo lançamento seria descartado.
  // defval: '' preserva as células vazias, mantendo o alinhamento com o
  // cabeçalho; blankrows: true preserva a linha em branco do rodapé, que
  // parseLedgerRows precisa ver para contá-la entre as descartadas.
  return XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: true,
  });
}

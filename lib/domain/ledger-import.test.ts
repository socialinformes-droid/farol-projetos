import { describe, it, expect } from 'vitest';
import { parseLedgerRows, LEDGER_HEADERS } from './ledger-import';

const HEADER = [...LEDGER_HEADERS];

function row(over: Partial<Record<string, string>> = {}): string[] {
  const base: Record<string, string> = {
    'Data': '30/04/2026',
    'Entidade': 'Sesi/Al',
    'Filial': '2831',
    'Unidade': '043001 - Projetos Estratégicos',
    'Centro': '30413070101 - Estruturante 2026 - Capacitações E Treinamentos',
    'Conta': '31010401001 - Passagens Nacionais',
    'Valor': '7795.41',
    'Comprovante': 'CONTAB000197595',
    'Diário': '2-02104071',
    'Data_do_Pagamento': '',
    'Data do Documento': '',
    'Descrição': 'Compra referente NF 000000 - FORNECEDOR EXEMPLO LTDA | PASSAGEM',
    'Texto de linha': '',
    'Referência': '',
    'CNPJ/CPF': '00.000.000/0001-00',
    'RAZÃO SOCIAL/NOME': 'FORNECEDOR EXEMPLO LTDA',
    'Requisição': '',
    'URL Requisição': '',
    'Recebimento': '',
    'URL Recebimento': '',
    'Documento': '',
    'URL Nota Fiscal': '',
    'URL Comprovante': 'https://exemplo.invalid/comprovante?id=1',
  };
  return HEADER.map((h) => over[h] ?? base[h] ?? '');
}

describe('parseLedgerRows', () => {
  it('extrai os campos de uma linha de despesa', () => {
    const { entries } = parseLedgerRows([HEADER, row()]);
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.entryDate).toBe('2026-04-30');
    expect(e.amount).toBe(7795.41);
    expect(e.kind).toBe('despesa');
    expect(e.costCenterCode).toBe('30413070101');
    expect(e.costCenterName).toBe('Estruturante 2026 - Capacitações E Treinamentos');
    expect(e.accountCode).toBe('31010401001');
    expect(e.accountName).toBe('Passagens Nacionais');
    expect(e.voucher).toBe('CONTAB000197595');
    expect(e.journal).toBe('2-02104071');
    expect(e.vendorName).toBe('FORNECEDOR EXEMPLO LTDA');
    expect(e.urls.comprovante).toBe('https://exemplo.invalid/comprovante?id=1');
  });

  it('separa código e nome no primeiro hífen, preservando hífens do nome', () => {
    const { entries } = parseLedgerRows([HEADER, row()]);
    expect(entries[0].costCenterName).toContain('Estruturante 2026 - Capacitações');
  });

  it('classifica conta 4xxx negativa como aporte recebido', () => {
    // O comprovante desta linha no arquivo real é RECEITAS000047236: é o valor
    // aportado no projeto, não dedução de despesa. O sinal negativo é a
    // convenção de crédito do razão — o valor bruto é preservado como veio.
    const aporte = row({
      'Conta': '41020304001 - Projetos Estratégicos',
      'Valor': '-41156.24',
      'Descrição': 'BAIXA DE PROJETOS',
      'Comprovante': 'RECEITAS000047236',
      'Diário': '2-02160197',
    });
    const { entries } = parseLedgerRows([HEADER, aporte]);
    expect(entries[0].kind).toBe('aporte');
    expect(entries[0].amount).toBe(-41156.24);
  });

  it('conta 4xxx com valor positivo continua despesa', () => {
    const { entries } = parseLedgerRows([HEADER, row({ 'Conta': '41020304001 - X', 'Valor': '10' })]);
    expect(entries[0].kind).toBe('despesa');
  });

  it('descarta a linha Total do rodapé', () => {
    const total = HEADER.map((h) => (h === 'Data' ? 'Total' : h === 'Valor' ? '7262.87' : ''));
    const result = parseLedgerRows([HEADER, row(), total]);
    expect(result.entries).toHaveLength(1);
    expect(result.discardedRows).toBe(1);
  });

  it('descarta a linha de filtros aplicados', () => {
    const filtros = HEADER.map((h) => (h === 'Data' ? 'Filtros aplicados:\nTipo não é Outro' : ''));
    const result = parseLedgerRows([HEADER, row(), filtros]);
    expect(result.entries).toHaveLength(1);
    expect(result.discardedRows).toBe(1);
  });

  it('descarta linha totalmente vazia', () => {
    const result = parseLedgerRows([HEADER, row(), HEADER.map(() => '')]);
    expect(result.entries).toHaveLength(1);
    expect(result.discardedRows).toBe(1);
  });

  it('agrupa centros de custo com contagem e total', () => {
    const outro = row({
      'Centro': '30413070102 - Outro Projeto',
      'Valor': '100',
      'Comprovante': 'CONTAB2',
      'Diário': '2-2',
    });
    const { centers } = parseLedgerRows([HEADER, row(), outro]);
    expect(centers).toHaveLength(2);
    const c = centers.find((x) => x.code === '30413070102')!;
    expect(c.name).toBe('Outro Projeto');
    expect(c.count).toBe(1);
    expect(c.total).toBe(100);
  });

  it('lê valor com vírgula decimal e separador de milhar', () => {
    const { entries } = parseLedgerRows([HEADER, row({ 'Valor': '1.234,56' })]);
    expect(entries[0].amount).toBe(1234.56);
  });

  it('converte datas opcionais e mantém null quando ausentes', () => {
    const { entries } = parseLedgerRows([
      HEADER,
      row({ 'Data_do_Pagamento': '15/05/2026', 'Data do Documento': '' }),
    ]);
    expect(entries[0].paymentDate).toBe('2026-05-15');
    expect(entries[0].documentDate).toBeNull();
  });

  it('rejeita cabeçalho que não é do razão', () => {
    expect(() => parseLedgerRows([['Coluna A', 'Coluna B'], ['1', '2']])).toThrow(
      /não parece ser o razão/i,
    );
  });

  it('preserva a linha original em raw para auditoria', () => {
    const { entries } = parseLedgerRows([HEADER, row()]);
    expect(entries[0].raw['Comprovante']).toBe('CONTAB000197595');
  });

  it('tolera linha mais curta que o cabeçalho', () => {
    const curta = row().slice(0, 9);
    const { entries } = parseLedgerRows([HEADER, curta]);
    expect(entries).toHaveLength(1);
    expect(entries[0].vendorName).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { resolveImport, type ResolutionContext } from './import-resolution';
import type { ParsedEntry } from './ledger-import';

function entry(over: Partial<ParsedEntry> = {}): ParsedEntry {
  return {
    costCenterCode: '30413070101',
    costCenterName: 'Estruturante 2026',
    accountCode: '31010401001',
    accountName: 'Passagens Nacionais',
    entryDate: '2026-04-30',
    amount: 100,
    kind: 'despesa',
    description: null,
    voucher: 'CONTAB1',
    journal: '2-1',
    document: null,
    reference: null,
    vendorDoc: null,
    vendorName: null,
    paymentDate: null,
    documentDate: null,
    urls: {},
    raw: {},
    ...over,
  };
}

const context: ResolutionContext = {
  projectsByCode: {
    '30413070101': { id: 'proj-1', name: 'Estruturante 2026' },
  },
  budgetLinesByProject: {
    'proj-1': [{ id: 'line-1', code: '31010401001' }],
  },
  existingKeysByProject: {
    'proj-1': [],
  },
};

describe('resolveImport', () => {
  it('associa o lançamento ao projeto e à rubrica existentes', () => {
    const plan = resolveImport([entry()], context);
    expect(plan.projects).toHaveLength(1);
    expect(plan.projects[0].projectId).toBe('proj-1');
    expect(plan.projects[0].newEntries).toHaveLength(1);
    expect(plan.projects[0].newEntries[0].budgetLineCode).toBe('31010401001');
    expect(plan.projects[0].newBudgetLines).toHaveLength(0);
  });

  it('marca como duplicado quando a chave já foi importada', () => {
    // A chave é um hash calculado internamente; pega-se o valor real de uma
    // primeira resolução e alimenta-se o contexto com ele.
    const chave = resolveImport([entry()], context).projects[0].newEntries[0].importKey!;
    const ctx: ResolutionContext = {
      ...context,
      existingKeysByProject: { 'proj-1': [chave] },
    };
    const plan = resolveImport([entry()], ctx);
    expect(plan.projects[0].newEntries).toHaveLength(0);
    expect(plan.projects[0].duplicateCount).toBe(1);
  });

  it('deduplica dentro do próprio arquivo', () => {
    const plan = resolveImport([entry(), entry()], context);
    expect(plan.projects[0].newEntries).toHaveLength(1);
    expect(plan.projects[0].duplicateCount).toBe(1);
  });

  it('não confunde linhas do mesmo documento separadas pela descrição', () => {
    // Caso real: CONTAB000200813 cobre 9 linhas, duas com a mesma conta e o
    // mesmo valor, distinguidas só pela nota fiscal citada na descrição.
    // Com a chave antiga (voucher+journal) uma delas era descartada.
    const a = entry({ description: 'Compra referente NF 180785 - BRASLUSO TURISMO LTDA' });
    const b = entry({ description: 'Compra referente NF 180789 - BRASLUSO TURISMO LTDA' });
    const plan = resolveImport([a, b], context);
    expect(plan.projects[0].newEntries).toHaveLength(2);
    expect(plan.projects[0].duplicateCount).toBe(0);
    expect(plan.projects[0].newEntries[0].importKey).not.toBe(
      plan.projects[0].newEntries[1].importKey,
    );
  });

  it('distingue linhas do mesmo documento por conta e por valor', () => {
    const porConta = entry({ accountCode: '31010403001', accountName: 'Hospedagens' });
    const porValor = entry({ amount: 999.99 });
    const plan = resolveImport([entry(), porConta, porValor], context);
    expect(plan.projects[0].newEntries).toHaveLength(3);
    expect(plan.projects[0].duplicateCount).toBe(0);
  });

  it('propõe rubrica nova quando a conta não existe', () => {
    const nova = entry({ accountCode: '31010403001', accountName: 'Hospedagens', voucher: 'C2' });
    const plan = resolveImport([nova], context);
    expect(plan.projects[0].newBudgetLines).toEqual([
      { code: '31010403001', name: 'Hospedagens' },
    ]);
    expect(plan.projects[0].unmappedCount).toBe(1);
  });

  it('propõe cada rubrica nova uma única vez', () => {
    const a = entry({ accountCode: '31010403001', accountName: 'Hospedagens', voucher: 'C2' });
    const b = entry({ accountCode: '31010403001', accountName: 'Hospedagens', voucher: 'C3' });
    const plan = resolveImport([a, b], context);
    expect(plan.projects[0].newBudgetLines).toHaveLength(1);
    expect(plan.projects[0].unmappedCount).toBe(2);
  });

  it('separa centros sem projeto cadastrado', () => {
    const orfa = entry({ costCenterCode: '99999', costCenterName: 'Projeto Não Cadastrado' });
    const plan = resolveImport([entry(), orfa], context);
    expect(plan.projects).toHaveLength(1);
    expect(plan.unknownCenters).toEqual([
      { code: '99999', name: 'Projeto Não Cadastrado', count: 1, total: 100 },
    ]);
  });

  it('soma despesas e baixas separadamente no resumo', () => {
    const baixa = entry({ kind: 'baixa', amount: -500, voucher: 'REC1', accountCode: '41020304001' });
    const plan = resolveImport([entry(), baixa], context);
    expect(plan.projects[0].expenseTotal).toBe(100);
    expect(plan.projects[0].writeoffTotal).toBe(-500);
    expect(plan.projects[0].newEntries).toHaveLength(2);
  });

  it('lançamento sem voucher nem journal nunca é tratado como duplicado', () => {
    const semChave = entry({ voucher: null, journal: null });
    const plan = resolveImport([semChave, semChave], context);
    expect(plan.projects[0].newEntries).toHaveLength(2);
    expect(plan.projects[0].duplicateCount).toBe(0);
  });

  it('devolve plano vazio para arquivo sem lançamentos', () => {
    const plan = resolveImport([], context);
    expect(plan.projects).toHaveLength(0);
    expect(plan.unknownCenters).toHaveLength(0);
  });
});

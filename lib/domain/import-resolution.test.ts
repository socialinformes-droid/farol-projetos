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
    'proj-1': [{ id: 'line-1', code: '31010401001', name: 'Passagens Nacionais' }],
  },
  existingKeysByProject: {
    'proj-1': [],
  },
  mappingsByProject: {
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
    expect(plan.projects[0].unmappedAccounts).toHaveLength(0);
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
    expect(plan.projects[0].unmappedAccounts).toEqual([
      { code: '31010403001', name: 'Hospedagens' },
    ]);
    expect(plan.projects[0].unmappedCount).toBe(1);
  });

  it('propõe cada rubrica nova uma única vez', () => {
    const a = entry({ accountCode: '31010403001', accountName: 'Hospedagens', voucher: 'C2' });
    const b = entry({ accountCode: '31010403001', accountName: 'Hospedagens', voucher: 'C3' });
    const plan = resolveImport([a, b], context);
    expect(plan.projects[0].unmappedAccounts).toHaveLength(1);
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

  it('soma despesas e aportes separadamente no resumo', () => {
    const baixa = entry({ kind: 'aporte', amount: -500, voucher: 'REC1', accountCode: '41020304001' });
    const plan = resolveImport([entry(), baixa], context);
    expect(plan.projects[0].expenseTotal).toBe(100);
    // O aporte entra positivo no plano: o razão o lança como crédito negativo.
    expect(plan.projects[0].contributionTotal).toBe(500);
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

  it('aporte não cria rubrica nem conta como não mapeado', () => {
    // A conta de receita não é rubrica de gasto: criar uma poluiria a tela de
    // orçamento e o gráfico com uma linha que nunca teria valor orçado.
    const aporte = entry({
      kind: 'aporte',
      amount: -41156.24,
      accountCode: '41020304001',
      accountName: 'Projetos Estratégicos',
      voucher: 'RECEITAS1',
    });
    const plan = resolveImport([aporte], context);
    expect(plan.projects[0].unmappedAccounts).toHaveLength(0);
    expect(plan.projects[0].unmappedCount).toBe(0);
    expect(plan.projects[0].newEntries[0].budgetLineId).toBeNull();
    expect(plan.projects[0].contributionTotal).toBe(41156.24);
  });

  it('despesa continua criando rubrica quando a conta é nova', () => {
    const nova = entry({ accountCode: '31010499001', accountName: 'Conta Nova', voucher: 'C9' });
    const plan = resolveImport([nova], context);
    expect(plan.projects[0].unmappedAccounts).toHaveLength(1);
    expect(plan.projects[0].unmappedCount).toBe(1);
  });

  it('usa o mapeamento salvo mesmo quando o código da conta não bate com nenhuma rubrica', () => {
    const ctx: ResolutionContext = {
      ...context,
      mappingsByProject: {
        'proj-1': [{ accountCode: '99988877', budgetLineId: 'line-1' }],
      },
    };
    const mapeada = entry({ accountCode: '99988877', accountName: 'Consultoria Jurídica' });
    const plan = resolveImport([mapeada], ctx);
    expect(plan.projects[0].newEntries[0].budgetLineId).toBe('line-1');
    expect(plan.projects[0].unmappedAccounts).toHaveLength(0);
    expect(plan.projects[0].unmappedCount).toBe(0);
  });

  it('duas contas mapeadas para a mesma rubrica não geram conta não mapeada', () => {
    const ctx: ResolutionContext = {
      ...context,
      mappingsByProject: {
        'proj-1': [
          { accountCode: '11122233', budgetLineId: 'line-1' },
          { accountCode: '44455566', budgetLineId: 'line-1' },
        ],
      },
    };
    const a = entry({ accountCode: '11122233', accountName: 'Consultoria Jurídica', voucher: 'C1' });
    const b = entry({ accountCode: '44455566', accountName: 'Consultoria Contábil', voucher: 'C2' });
    const plan = resolveImport([a, b], ctx);
    expect(plan.projects[0].newEntries[0].budgetLineId).toBe('line-1');
    expect(plan.projects[0].newEntries[1].budgetLineId).toBe('line-1');
    expect(plan.projects[0].unmappedAccounts).toHaveLength(0);
  });

  it('expõe as rubricas existentes do projeto no plano, para a tela de resolução', () => {
    const plan = resolveImport([entry()], context);
    expect(plan.projects[0].existingBudgetLines).toEqual([
      { id: 'line-1', code: '31010401001', name: 'Passagens Nacionais' },
    ]);
  });

  it('o mapeamento salvo tem precedência sobre o casamento direto por código', () => {
    // A mesma conta bate por mapeamento (-> line-2) e por código direto em
    // budget_lines (-> line-1, já existe no fixture com code '31010401001').
    // O mapeamento precisa vencer: é o caminho normal depois que o projeto já
    // resolveu essa conta uma vez, o casamento por código é só fallback.
    const ctx: ResolutionContext = {
      ...context,
      budgetLinesByProject: {
        'proj-1': [
          { id: 'line-1', code: '31010401001', name: 'Passagens Nacionais' },
          { id: 'line-2', code: null, name: 'Passagens Nacionais (renomeada)' },
        ],
      },
      mappingsByProject: {
        'proj-1': [{ accountCode: '31010401001', budgetLineId: 'line-2' }],
      },
    };
    const plan = resolveImport([entry()], ctx);
    expect(plan.projects[0].newEntries[0].budgetLineId).toBe('line-2');
    expect(plan.projects[0].unmappedAccounts).toHaveLength(0);
  });

  it('aporte não usa mapeamento salvo mesmo quando existe um para a conta', () => {
    // Se a guarda isAporte fosse removida (ou checada depois do mapeamento),
    // essa conta resolveria para line-1 por causa do mapeamento abaixo.
    const ctx: ResolutionContext = {
      ...context,
      mappingsByProject: {
        'proj-1': [{ accountCode: '41020304001', budgetLineId: 'line-1' }],
      },
    };
    const aporte = entry({
      kind: 'aporte',
      amount: -500,
      accountCode: '41020304001',
      accountName: 'Projetos Estratégicos',
      voucher: 'REC1',
    });
    const plan = resolveImport([aporte], ctx);
    expect(plan.projects[0].newEntries[0].budgetLineId).toBeNull();
    expect(plan.projects[0].unmappedAccounts).toHaveLength(0);
  });
});

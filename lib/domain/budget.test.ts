import { describe, it, expect } from 'vitest';
import { summarizeProject, type LineInput, type EntryInput, type ProjectInput } from './budget';

const project: ProjectInput = {
  totalBudget: 100,
  transferLimitPct: 25,
  warningThresholdPct: 80,
};

function line(id: string, budgeted: number | null, parentId: string | null = null): LineInput {
  return { id, parentId, code: id, name: id, budgetedAmount: budgeted, sortOrder: 0 };
}

function entry(lineId: string | null, amount: number, kind: EntryInput['kind'] = 'despesa'): EntryInput {
  return { budgetLineId: lineId, amount, kind };
}

describe('summarizeProject', () => {
  it('soma o realizado por rubrica e calcula saldo', () => {
    const s = summarizeProject(project, [line('a', 10)], [entry('a', 4), entry('a', 3)]);
    expect(s.lines[0].realized).toBe(7);
    expect(s.lines[0].balance).toBe(3);
    expect(s.lines[0].excess).toBe(0);
    expect(s.realized).toBe(7);
    expect(s.available).toBe(93);
  });

  it('conta só o excesso: economia não abate estouro', () => {
    const lines = [line('a', 10), line('b', 10), line('c', 10)];
    const entries = [entry('a', 22), entry('b', 18), entry('c', 4)];
    const s = summarizeProject(project, lines, entries);
    expect(s.lines[0].excess).toBe(12);
    expect(s.lines[1].excess).toBe(8);
    expect(s.lines[2].excess).toBe(0);
    expect(s.transferred).toBe(20);
  });

  it('calcula o teto e o consumo do teto', () => {
    const lines = [line('a', 10), line('b', 10)];
    const s = summarizeProject(project, lines, [entry('a', 22), entry('b', 18)]);
    expect(s.transferCap).toBe(25);
    expect(s.capUsagePct).toBe(80);
    expect(s.status).toBe('aviso');
  });

  it('fica ok abaixo do limiar de aviso', () => {
    const s = summarizeProject(project, [line('a', 10)], [entry('a', 15)]);
    expect(s.transferred).toBe(5);
    expect(s.capUsagePct).toBe(20);
    expect(s.status).toBe('ok');
  });

  it('viola quando o remanejado passa do teto', () => {
    const s = summarizeProject(project, [line('a', 10)], [entry('a', 40)]);
    expect(s.transferred).toBe(30);
    expect(s.status).toBe('violacao');
  });

  it('viola quando o realizado passa do total do projeto', () => {
    const lines = [line('a', 50), line('b', 50)];
    const s = summarizeProject(project, lines, [entry('a', 60), entry('b', 55)]);
    expect(s.overBudget).toBe(true);
    expect(s.status).toBe('violacao');
  });

  it('rubrica sem orçamento não gera excesso e é contabilizada à parte', () => {
    const lines = [line('a', 10), line('b', null)];
    const s = summarizeProject(project, lines, [entry('a', 8), entry('b', 30)]);
    expect(s.transferred).toBe(0);
    expect(s.linesWithoutBudget).toBe(1);
    expect(s.realized).toBe(38);
    expect(s.lines[1].balance).toBeNull();
    expect(s.lines[1].excess).toBe(0);
  });

  it('rubrica-pai acumula o realizado das filhas sem dupla contagem', () => {
    const lines = [line('pai', 20), line('f1', null, 'pai'), line('f2', null, 'pai')];
    const entries = [entry('f1', 12), entry('f2', 13)];
    const s = summarizeProject(project, lines, entries);
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0].realized).toBe(25);
    expect(s.lines[0].children).toHaveLength(2);
    expect(s.lines[0].children[0].realized).toBe(12);
    expect(s.transferred).toBe(5);
    expect(s.realized).toBe(25);
  });

  it('ignora baixas no realizado e no teto, somando à parte', () => {
    const s = summarizeProject(project, [line('a', 10)], [entry('a', 15), entry('a', -41, 'baixa')]);
    expect(s.realized).toBe(15);
    expect(s.transferred).toBe(5);
    expect(s.writeoffs).toBe(-41);
  });

  it('conta lançamento manual no realizado', () => {
    const s = summarizeProject(project, [line('a', 10)], [entry('a', 5, 'manual')]);
    expect(s.realized).toBe(5);
  });

  it('agrupa lançamento sem rubrica em unclassifiedTotal', () => {
    const s = summarizeProject(project, [line('a', 10)], [entry('a', 5), entry(null, 7)]);
    expect(s.unclassifiedTotal).toBe(7);
    expect(s.realized).toBe(12);
    expect(s.transferred).toBe(0);
  });

  it('respeita limites customizados do projeto', () => {
    const custom: ProjectInput = { totalBudget: 200, transferLimitPct: 10, warningThresholdPct: 50 };
    const s = summarizeProject(custom, [line('a', 100)], [entry('a', 111)]);
    expect(s.transferCap).toBe(20);
    expect(s.transferred).toBe(11);
    expect(s.capUsagePct).toBe(55);
    expect(s.status).toBe('aviso');
  });

  it('trata teto zero sem dividir por zero', () => {
    const zero: ProjectInput = { totalBudget: 100, transferLimitPct: 0, warningThresholdPct: 80 };
    const semEstouro = summarizeProject(zero, [line('a', 10)], [entry('a', 8)]);
    expect(semEstouro.capUsagePct).toBe(0);
    expect(semEstouro.status).toBe('ok');

    const comEstouro = summarizeProject(zero, [line('a', 10)], [entry('a', 12)]);
    expect(comEstouro.capUsagePct).toBe(100);
    expect(comEstouro.status).toBe('violacao');
  });

  it('ordena rubricas por sortOrder e depois por código', () => {
    const lines: LineInput[] = [
      { id: 'z', parentId: null, code: '999', name: 'z', budgetedAmount: 1, sortOrder: 5 },
      { id: 'a', parentId: null, code: '111', name: 'a', budgetedAmount: 1, sortOrder: 1 },
    ];
    const s = summarizeProject(project, lines, []);
    expect(s.lines.map((l) => l.id)).toEqual(['a', 'z']);
  });
});

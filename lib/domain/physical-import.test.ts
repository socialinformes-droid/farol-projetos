import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { parsePhysicalRows, PHYSICAL_HEADERS } from './physical-import';

const HEADER = [...PHYSICAL_HEADERS];

function row(over: Partial<Record<string, string>> = {}): string[] {
  const base: Record<string, string> = {
    'Entrega': 'Participação na Capacitação Exemplo 2026',
    'Atividade': 'Planejar participação e definir representantes',
    'Tarefa': '',
    'Responsável': 'Fulano de Tal',
    'Data Início': '09/03/2026',
    'Data Fim': '18/03/2026',
    '% de Realização': '100,00',
    'Data Real do Início': '09/03/2026',
    'Data Real da Finalização': '18/03/2026',
    'Status': 'Concluido',
    'Data da Atualização': '15/07/2026',
  };
  return HEADER.map((h) => over[h] ?? base[h] ?? '');
}

describe('parsePhysicalRows', () => {
  it('extrai os campos de uma atividade', () => {
    const { activities } = parsePhysicalRows([HEADER, row()]);
    expect(activities).toHaveLength(1);
    const a = activities[0];
    expect(a.deliverableName).toBe('Participação na Capacitação Exemplo 2026');
    expect(a.name).toBe('Planejar participação e definir representantes');
    expect(a.responsible).toBe('Fulano de Tal');
    expect(a.plannedStart).toBe('2026-03-09');
    expect(a.plannedEnd).toBe('2026-03-18');
    expect(a.sgfActualStart).toBe('2026-03-09');
    expect(a.sgfActualEnd).toBe('2026-03-18');
    expect(a.sgfStatus).toBe('Concluido');
    expect(a.sgfUpdatedAt).toBe('2026-07-15');
  });

  it('preenche a entrega por herança quando a linha vem sem valor (merge de célula)', () => {
    const primeira = row({
      'Entrega': 'Entrega Exemplo A',
      'Atividade': 'Atividade 1',
    });
    const segunda = row({
      'Entrega': '',
      'Atividade': 'Atividade 2',
    });
    const terceira = row({
      'Entrega': '',
      'Atividade': 'Atividade 3',
    });
    const { activities } = parsePhysicalRows([HEADER, primeira, segunda, terceira]);
    expect(activities).toHaveLength(3);
    expect(activities[0].deliverableName).toBe('Entrega Exemplo A');
    expect(activities[1].deliverableName).toBe('Entrega Exemplo A');
    expect(activities[2].deliverableName).toBe('Entrega Exemplo A');
  });

  it('herda a entrega correta ao trocar de grupo no meio do arquivo', () => {
    const grupoA1 = row({ 'Entrega': 'Entrega A', 'Atividade': 'A1' });
    const grupoA2 = row({ 'Entrega': '', 'Atividade': 'A2' });
    const grupoB1 = row({ 'Entrega': 'Entrega B', 'Atividade': 'B1' });
    const grupoB2 = row({ 'Entrega': '', 'Atividade': 'B2' });
    const { activities } = parsePhysicalRows([HEADER, grupoA1, grupoA2, grupoB1, grupoB2]);
    expect(activities.map((a) => a.deliverableName)).toEqual([
      'Entrega A',
      'Entrega A',
      'Entrega B',
      'Entrega B',
    ]);
  });

  it('converte datas dd/MM/yyyy para ISO e mantém null quando a data real está vazia', () => {
    const emAndamento = row({
      'Status': 'Em andamento',
      'Data Real do Início': '',
      'Data Real da Finalização': '',
    });
    const { activities } = parsePhysicalRows([HEADER, emAndamento]);
    expect(activities[0].plannedStart).toBe('2026-03-09');
    expect(activities[0].sgfActualStart).toBeNull();
    expect(activities[0].sgfActualEnd).toBeNull();
  });

  it('importKey difere para a mesma atividade em entregas diferentes', () => {
    const emEntregaA = row({ 'Entrega': 'Entrega A', 'Atividade': 'Atividade Repetida' });
    const emEntregaB = row({ 'Entrega': 'Entrega B', 'Atividade': 'Atividade Repetida' });
    const { activities } = parsePhysicalRows([HEADER, emEntregaA, emEntregaB]);
    expect(activities[0].importKey).not.toBe(activities[1].importKey);
  });

  it('importKey é estável quando a data planejada muda (replanejamento no SGF)', () => {
    const antesDoReplan = row({
      'Entrega': 'Entrega A',
      'Atividade': 'Atividade X',
      'Data Início': '09/03/2026',
      'Data Fim': '18/03/2026',
    });
    const depoisDoReplan = row({
      'Entrega': 'Entrega A',
      'Atividade': 'Atividade X',
      'Data Início': '01/04/2026',
      'Data Fim': '30/04/2026',
    });
    const { activities: antes } = parsePhysicalRows([HEADER, antesDoReplan]);
    const { activities: depois } = parsePhysicalRows([HEADER, depoisDoReplan]);
    expect(antes[0].importKey).toBe(depois[0].importKey);

    // A chave é o hash de deliverableName + '|' + activityName — confirma o
    // cálculo exato, não só a igualdade entre as duas chamadas.
    const expected = createHash('sha256')
      .update('Entrega A|Atividade X')
      .digest('hex');
    expect(antes[0].importKey).toBe(expected);
  });

  it('preserva o status bruto do SGF, incluindo "Concluido" sem acento', () => {
    const { activities } = parsePhysicalRows([HEADER, row({ 'Status': 'Concluido' })]);
    expect(activities[0].sgfStatus).toBe('Concluido');
  });

  it('não expõe "% de Realização" em nenhum campo da saída', () => {
    const { activities } = parsePhysicalRows([HEADER, row({ '% de Realização': '100,00' })]);
    const serialized = JSON.stringify(activities[0]);
    expect(serialized).not.toContain('100,00');
    expect(Object.keys(activities[0])).not.toContain('percentComplete');
    expect(Object.keys(activities[0])).not.toContain('realizacao');
  });

  it('descarta linha sem nome de atividade e conta o descarte', () => {
    const semAtividade = row({ 'Atividade': '' });
    const { activities, discardedRows } = parsePhysicalRows([HEADER, row(), semAtividade]);
    expect(activities).toHaveLength(1);
    expect(discardedRows).toBe(1);
  });

  it('rejeita cabeçalho que não é o relatório de cronograma físico', () => {
    expect(() => parsePhysicalRows([['Coluna A', 'Coluna B'], ['1', '2']])).toThrow(
      /cronograma físico/i,
    );
  });

  it('não quebra quando a coluna Tarefa vem preenchida (nível não usado hoje)', () => {
    const comTarefa = row({ 'Tarefa': 'Algum subnível inesperado' });
    expect(() => parsePhysicalRows([HEADER, comTarefa])).not.toThrow();
  });

  it('devolve as entregas na ordem do arquivo com a contagem certa de atividades', () => {
    const a1 = row({ 'Entrega': 'Entrega A', 'Atividade': 'A1' });
    const a2 = row({ 'Entrega': '', 'Atividade': 'A2' });
    const a3 = row({ 'Entrega': '', 'Atividade': 'A3' });
    const b1 = row({ 'Entrega': 'Entrega B', 'Atividade': 'B1' });
    const b2 = row({ 'Entrega': '', 'Atividade': 'B2' });
    const { deliverables } = parsePhysicalRows([HEADER, a1, a2, a3, b1, b2]);
    expect(deliverables).toEqual([
      { name: 'Entrega A', sortOrder: 0, activityCount: 3 },
      { name: 'Entrega B', sortOrder: 1, activityCount: 2 },
    ]);
  });

  it('numera sortOrder das atividades preservando a ordem do arquivo', () => {
    const a1 = row({ 'Entrega': 'Entrega A', 'Atividade': 'A1' });
    const a2 = row({ 'Entrega': '', 'Atividade': 'A2' });
    const { activities } = parsePhysicalRows([HEADER, a1, a2]);
    expect(activities[0].sortOrder).toBe(0);
    expect(activities[1].sortOrder).toBe(1);
  });

  it('responsável vazio vira null', () => {
    const { activities } = parsePhysicalRows([HEADER, row({ 'Responsável': '' })]);
    expect(activities[0].responsible).toBeNull();
  });
});

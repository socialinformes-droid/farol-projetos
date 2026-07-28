import { describe, it, expect } from 'vitest';
import { extractRelevantSections } from './project-context';

describe('extractRelevantSections', () => {
  it('corta de JUSTIFICATIVA até DADOS COMPLEMENTARES quando os dois marcadores existem', () => {
    const fullText = [
      'CABEÇALHO DO RELATÓRIO SGF — não interessa',
      'JUSTIFICATIVA',
      'Texto da justificativa do projeto, bem relevante para o objetivo.',
      'OBJETIVO GERAL',
      'Texto do objetivo geral.',
      'ESCOPO',
      'O que está incluso no projeto.',
      'DADOS COMPLEMENTARES',
      'Informação que não interessa mais para o contexto.',
      'EQUIPE',
      'Fulano, Beltrano, Ciclano — lista enorme de nomes.',
    ].join('\n');

    const { text, trimmed } = extractRelevantSections(fullText);

    expect(text).toContain('JUSTIFICATIVA');
    expect(text).toContain('Texto da justificativa');
    expect(text).toContain('OBJETIVO GERAL');
    expect(text).toContain('ESCOPO');
    expect(text).not.toContain('DADOS COMPLEMENTARES');
    expect(text).not.toContain('EQUIPE');
    expect(text).not.toContain('Fulano');
    expect(text).not.toContain('CABEÇALHO DO RELATÓRIO');
    expect(trimmed).toBe(false);
  });

  it('usa OBJETIVO GERAL como início quando JUSTIFICATIVA não existe', () => {
    const fullText = [
      'CABEÇALHO — não interessa',
      'OBJETIVO GERAL',
      'Texto do objetivo geral do projeto.',
      'ESCOPO',
      'O que está incluso.',
      'DADOS COMPLEMENTARES',
      'Não interessa mais.',
    ].join('\n');

    const { text, trimmed } = extractRelevantSections(fullText);

    expect(text).toContain('OBJETIVO GERAL');
    expect(text).toContain('Texto do objetivo geral');
    expect(text).not.toContain('CABEÇALHO');
    expect(text).not.toContain('DADOS COMPLEMENTARES');
    expect(trimmed).toBe(false);
  });

  it('usa LINHAS DE ATUAÇÃO como fim quando DADOS COMPLEMENTARES não existe', () => {
    const fullText = [
      'JUSTIFICATIVA',
      'Texto da justificativa.',
      'ESCOPO',
      'O que está incluso.',
      'LINHAS DE ATUAÇÃO',
      'Não interessa mais.',
      'EQUIPE',
      'Lista de nomes.',
    ].join('\n');

    const { text, trimmed } = extractRelevantSections(fullText);

    expect(text).toContain('JUSTIFICATIVA');
    expect(text).toContain('ESCOPO');
    expect(text).not.toContain('LINHAS DE ATUAÇÃO');
    expect(text).not.toContain('EQUIPE');
    expect(trimmed).toBe(false);
  });

  it('usa EQUIPE como fim quando nem DADOS COMPLEMENTARES nem LINHAS DE ATUAÇÃO existem', () => {
    const fullText = [
      'JUSTIFICATIVA',
      'Texto da justificativa.',
      'ESCOPO',
      'O que está incluso.',
      'EQUIPE',
      'Lista de nomes que não interessa.',
    ].join('\n');

    const { text, trimmed } = extractRelevantSections(fullText);

    expect(text).toContain('JUSTIFICATIVA');
    expect(text).toContain('ESCOPO');
    expect(text).not.toContain('EQUIPE');
    expect(text).not.toContain('Lista de nomes');
    expect(trimmed).toBe(false);
  });

  it('quando nenhum marcador reconhecido existe, devolve o texto truncado a um teto e marca trimmed', () => {
    const fullText = 'X'.repeat(20_000);

    const { text, trimmed } = extractRelevantSections(fullText);

    expect(text.length).toBeLessThanOrEqual(8000);
    expect(trimmed).toBe(true);
  });

  it('quando nenhum marcador existe mas o texto já é curto, devolve o texto inteiro sem marcar trimmed', () => {
    const fullText = 'Um documento curto qualquer, sem nenhuma das seções reconhecidas pelo Farol.';

    const { text, trimmed } = extractRelevantSections(fullText);

    expect(text).toContain('Um documento curto qualquer');
    expect(trimmed).toBe(false);
  });

  it('nunca lança erro, mesmo para texto vazio', () => {
    expect(() => extractRelevantSections('')).not.toThrow();
    const { text, trimmed } = extractRelevantSections('');
    expect(text).toBe('');
    expect(trimmed).toBe(false);
  });

  it('normaliza sequências de espaços em branco (quebras de linha, tabs, espaços repetidos)', () => {
    const fullText = 'JUSTIFICATIVA\n\n\n   Texto   com    espaços\t\tirregulares.\n\nDADOS COMPLEMENTARES\nresto';
    const { text } = extractRelevantSections(fullText);
    expect(text).not.toMatch(/\s{2,}/);
  });

  it('com os marcadores reais do relatório SGF, extrai por volta de 3.900 caracteres', () => {
    // Réplica aproximada da estrutura real (offsets do documento de
    // referência: JUSTIFICATIVA em 457, DADOS COMPLEMENTARES em 4370).
    const filler = (label: string, size: number) => `${label}\n${'a'.repeat(size)}\n`;
    const fullText =
      filler('CABEÇALHO', 440) +
      filler('JUSTIFICATIVA', 1000) +
      filler('OBJETIVO GERAL', 500) +
      filler('OBJETIVOS ESPECÍFICOS', 40) +
      filler('ESCOPO', 1400) +
      filler('NÃO ESCOPO', 700) +
      'DADOS COMPLEMENTARES\n' +
      filler('EQUIPE', 2500);

    const { text, trimmed } = extractRelevantSections(fullText);
    expect(text.length).toBeGreaterThan(3500);
    expect(text.length).toBeLessThan(4500);
    expect(trimmed).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { entryDetailsSchema } from './entry-schema';

function parse(input: Record<string, unknown>) {
  return entryDetailsSchema.safeParse(input);
}

describe('entryDetailsSchema', () => {
  it('aceita URLs http e https', () => {
    const r = parse({
      notaFiscalUrl: 'https://genusapi.sistemafiea.com.br/api/nf?id=1',
      comprovanteUrl: 'http://exemplo.invalid/c',
      notes: null,
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.notaFiscalUrl).toBe(
      'https://genusapi.sistemafiea.com.br/api/nf?id=1',
    );
  });

  it('converte string vazia em null', () => {
    const r = parse({ notaFiscalUrl: '', comprovanteUrl: '   ', notes: '' });
    expect(r.success).toBe(true);
    expect(r.success && r.data.notaFiscalUrl).toBeNull();
    expect(r.success && r.data.comprovanteUrl).toBeNull();
    expect(r.success && r.data.notes).toBeNull();
  });

  it('aceita campos ausentes', () => {
    const r = parse({});
    expect(r.success).toBe(true);
    expect(r.success && r.data.notaFiscalUrl).toBeNull();
  });

  it('rejeita texto que não é URL', () => {
    const r = parse({ notaFiscalUrl: 'nota 180789', comprovanteUrl: null, notes: null });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0].message).toMatch(/http/i);
  });

  it('rejeita protocolo que não seja http nem https', () => {
    // Um javascript: coladinho viraria link executável na tabela.
    const r = parse({ notaFiscalUrl: 'javascript:alert(1)', comprovanteUrl: null, notes: null });
    expect(r.success).toBe(false);
  });

  it('preserva a observação e remove espaço nas pontas', () => {
    const r = parse({ notaFiscalUrl: null, comprovanteUrl: null, notes: '  conferir com o Bruno ' });
    expect(r.success && r.data.notes).toBe('conferir com o Bruno');
  });
});

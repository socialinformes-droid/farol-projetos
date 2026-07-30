import { describe, it, expect } from 'vitest';
import { mappingFormSchema } from './mapping-schema';

function parse(input: Record<string, unknown>) {
  return mappingFormSchema.safeParse(input);
}

describe('mappingFormSchema', () => {
  it('aceita conta, nome e rubrica válidos', () => {
    const r = parse({
      accountCode: '31010401001',
      accountName: 'Passagens Nacionais',
      budgetLineId: '11111111-1111-4111-8111-111111111111',
    });
    expect(r.success).toBe(true);
  });

  it('rejeita código de conta vazio', () => {
    const r = parse({
      accountCode: '   ',
      accountName: null,
      budgetLineId: '11111111-1111-4111-8111-111111111111',
    });
    expect(r.success).toBe(false);
  });

  it('aceita nome de conta nulo', () => {
    const r = parse({
      accountCode: '31010401001',
      accountName: null,
      budgetLineId: '11111111-1111-4111-8111-111111111111',
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.accountName).toBeNull();
  });

  it('rejeita budgetLineId que não é uuid', () => {
    const r = parse({
      accountCode: '31010401001',
      accountName: null,
      budgetLineId: 'nao-e-uuid',
    });
    expect(r.success).toBe(false);
  });

  it('remove espaço nas pontas do código da conta', () => {
    const r = parse({
      accountCode: '  31010401001  ',
      accountName: null,
      budgetLineId: '11111111-1111-4111-8111-111111111111',
    });
    expect(r.success && r.data.accountCode).toBe('31010401001');
  });
});

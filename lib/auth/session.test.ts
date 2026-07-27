import { describe, it, expect } from 'vitest';
import { createSessionToken, verifySessionToken } from './session';

const SECRET = 'segredo-de-teste-com-tamanho-razoavel';
const NOW = 1_700_000_000_000;

describe('sessão por senha única', () => {
  it('aceita um token que ela mesma emitiu', async () => {
    const token = await createSessionToken(SECRET, NOW);
    expect(await verifySessionToken(token, SECRET, NOW)).toBe(true);
  });

  it('rejeita token assinado com outro segredo', async () => {
    const token = await createSessionToken('outro-segredo', NOW);
    expect(await verifySessionToken(token, SECRET, NOW)).toBe(false);
  });

  it('rejeita token adulterado', async () => {
    const token = await createSessionToken(SECRET, NOW);
    const [payload, mac] = token.split('.');
    expect(await verifySessionToken(`${Number(payload) + 1}.${mac}`, SECRET, NOW)).toBe(false);
  });

  it('rejeita token expirado', async () => {
    const token = await createSessionToken(SECRET, NOW);
    const trintaEUmDias = 31 * 24 * 60 * 60 * 1000;
    expect(await verifySessionToken(token, SECRET, NOW + trintaEUmDias)).toBe(false);
  });

  it('aceita token dentro da validade', async () => {
    const token = await createSessionToken(SECRET, NOW);
    const vinteENoveDias = 29 * 24 * 60 * 60 * 1000;
    expect(await verifySessionToken(token, SECRET, NOW + vinteENoveDias)).toBe(true);
  });

  it('rejeita undefined e lixo', async () => {
    expect(await verifySessionToken(undefined, SECRET, NOW)).toBe(false);
    expect(await verifySessionToken('', SECRET, NOW)).toBe(false);
    expect(await verifySessionToken('abc', SECRET, NOW)).toBe(false);
    expect(await verifySessionToken('abc.def', SECRET, NOW)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { normalizarNumero } from './numero.js';

describe('normalizarNumero', () => {
  it.each([
    ['A1 135'],
    ['A 0001 00000135'],
    ['A-1-135'],
    ['A0001-00000135'],
    ['A-0001-00000135'],
    ['a 1-135'],
  ])('%s → A-0001-00000135', (texto) => {
    expect(normalizarNumero(texto)).toEqual({ ok: true, numero: 'A-0001-00000135', letra: 'A' });
  });

  it('acepta B y C', () => {
    expect(normalizarNumero('C 12 9')).toEqual({ ok: true, numero: 'C-0012-00000009', letra: 'C' });
    expect(normalizarNumero('B4264 1')).toMatchObject({ ok: true, numero: 'B-4264-00000001' });
  });

  it.each([
    ['E 1 135', /letra E/],
    ['A 12345 1', /punto de venta/],
    ['A 1 123456789', /número tiene más/],
    ['A1', /No se reconoce/],
    ['135', /No se reconoce/],
    ['A 1 0', /Falta el número/],
  ])('%s queda pendiente', (texto, motivo) => {
    const r = normalizarNumero(texto);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(motivo);
  });
});

import { describe, expect, it } from 'vitest';
import { interpretarNumero } from './numero.js';

describe('interpretarNumero', () => {
  it.each([['X1 9463'], ['X-1-9463'], ['X 0001 00009463'], ['X-0001-00009463'], ['x0001-00009463'], [' X 1-9463 ']])(
    '%s → X-0001-00009463',
    (texto) => {
      expect(interpretarNumero(texto)).toEqual({ ok: true, patron: 'X-0001-00009463', numero: 'X-0001-00009463' });
    },
  );

  it('letra y número: cualquier punto de venta', () => {
    expect(interpretarNumero('X 9463')).toEqual({ ok: true, patron: 'X-____-00009463', numero: 'X-????-00009463' });
    expect(interpretarNumero('g9463')).toEqual({ ok: true, patron: 'G-____-00009463', numero: 'G-????-00009463' });
  });

  it('solo el número: cualquier letra y punto de venta', () => {
    expect(interpretarNumero('9463')).toEqual({ ok: true, patron: '_-____-00009463', numero: '?-????-00009463' });
  });

  it('punto de venta y número sin letra: cualquier letra', () => {
    expect(interpretarNumero('1-9463')).toEqual({ ok: true, patron: '_-0001-00009463', numero: '?-0001-00009463' });
  });

  it.each([
    ['abc', /No se reconoce/],
    ['', /No se reconoce/],
    ['X 1 2 3', /No se reconoce/],
    ['X1 0', /Falta el número/],
    ['0', /Falta el número/],
    ['X 12345 1', /punto de venta/],
    ['123456789', /más de 8 dígitos/],
    ['X 1 123456789', /más de 8 dígitos/],
  ])('%s no se puede interpretar', (texto, motivo) => {
    const r = interpretarNumero(texto);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(motivo);
  });
});

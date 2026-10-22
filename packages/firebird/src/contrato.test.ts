import { describe, expect, it } from 'vitest';
import { ErrorTool } from '@mcp-jkmate/core';
import { aplicarContrato } from './contrato.js';

const ERROR = { RESULTADO: 0, MENSAJE_ERROR: 'Límite entre 1 y 100 y desplazamiento >= 0' };

describe('contrato RESULTADO/MENSAJE_ERROR', () => {
  it('RESULTADO = 0 → PARAMETRO_INVALIDO con el mensaje del SP', () => {
    expect(() => aplicarContrato('PROC_X', [ERROR])).toThrowError(
      expect.objectContaining({ codigo: 'PARAMETRO_INVALIDO', message: ERROR.MENSAJE_ERROR }),
    );
  });

  it('prefijo NO_AUTORIZADO: → NO_AUTORIZADO sin el prefijo', () => {
    try {
      aplicarContrato('PROC_X', [{ RESULTADO: 0, MENSAJE_ERROR: 'NO_AUTORIZADO: no podés ver este ticket' }]);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorTool);
      expect((e as ErrorTool).codigo).toBe('NO_AUTORIZADO');
      expect((e as ErrorTool).message).toBe('no podés ver este ticket');
    }
  });

  it('filas con RESULTADO = 1 se devuelven sin RESULTADO ni MENSAJE_ERROR', () => {
    expect(aplicarContrato('PROC_X', [{ RESULTADO: 1, MENSAJE_ERROR: '', A: 1 }, { RESULTADO: 1, MENSAJE_ERROR: '', A: 2 }])).toEqual([
      { A: 1 },
      { A: 2 },
    ]);
  });

  it('cero filas = sin datos, no error', () => {
    expect(aplicarContrato('PROC_X', [])).toEqual([]);
  });
});

/*
 * Tests de tipos (los corre `vitest` con typecheck y también `tsc --noEmit`): un código que el
 * servidor no declaró en `CODIGOS_ERROR` no compila.
 */
import { describe, expectTypeOf, it } from 'vitest';
import { ErrorTool, type CodigoError } from '../src/errores.js';

describe('códigos de error', () => {
  it('ErrorTool acepta los códigos base y los del dominio', () => {
    expectTypeOf(new ErrorTool('BASE_NO_DISPONIBLE', 'x').codigo).toEqualTypeOf<CodigoError>();
    expectTypeOf(new ErrorTool('COMPROBANTE_DUPLICADO', 'x').codigo).toEqualTypeOf<CodigoError>();
    expectTypeOf<CodigoError>().toEqualTypeOf<
      'PARAMETRO_INVALIDO' | 'NO_AUTORIZADO' | 'BASE_NO_DISPONIBLE' | 'ERROR_INTERNO' | 'COMPROBANTE_DUPLICADO' | 'PERIODO_CERRADO'
    >();
  });

  it('ErrorTool rechaza un código del dominio que no se declaró', () => {
    // @ts-expect-error COMPROBANTE_NO_ENCONTRADO no está en CODIGOS_ERROR
    new ErrorTool('COMPROBANTE_NO_ENCONTRADO', 'x');
  });
});

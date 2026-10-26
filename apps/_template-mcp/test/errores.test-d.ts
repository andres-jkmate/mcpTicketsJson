/*
 * Tests de tipos (los corre `vitest` con typecheck y también `tsc --noEmit`): un código que el
 * servidor no declaró en `CODIGOS_ERROR` no compila. Al cambiar los códigos del dominio en
 * `src/errores.ts`, actualizar el tipo esperado y el código ajeno de abajo.
 */
import { describe, expectTypeOf, it } from 'vitest';
import { ErrorTool, type CodigoError } from '../src/errores.js';

describe('códigos de error', () => {
  it('ErrorTool acepta los códigos declarados', () => {
    expectTypeOf(new ErrorTool('EJEMPLO_NO_ENCONTRADO', 'x').codigo).toEqualTypeOf<CodigoError>();
    expectTypeOf<CodigoError>().toEqualTypeOf<
      'PARAMETRO_INVALIDO' | 'EJEMPLO_NO_ENCONTRADO' | 'NO_AUTORIZADO' | 'BASE_NO_DISPONIBLE' | 'ERROR_INTERNO'
    >();
  });

  it('ErrorTool rechaza un código que el servidor no declaró', () => {
    // @ts-expect-error CLIENTE_NO_ENCONTRADO no está en CODIGOS_ERROR
    new ErrorTool('CLIENTE_NO_ENCONTRADO', 'x');
  });
});

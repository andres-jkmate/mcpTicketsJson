/*
 * Tests de tipos (los corre `vitest` con typecheck y también `tsc --noEmit`): los controles de
 * códigos de error que tienen que fallar en compilación.
 */
import { describe, expectTypeOf, it } from 'vitest';
import { ErrorTool, type CodigoBase, type CodigosError } from './errores.js';
import { crearServidorMcp } from './servidor.js';
import { loggerEnMemoria } from './pruebas.js';

const CODIGOS_APP = ['PARAMETRO_INVALIDO', 'RECURSO_NO_ENCONTRADO', 'NO_AUTORIZADO', 'BASE_NO_DISPONIBLE', 'ERROR_INTERNO'] as const;
type CodigoApp = (typeof CODIGOS_APP)[number];
class ErrorApp extends ErrorTool<CodigoApp> {}

describe('códigos de error', () => {
  it('sin parámetro de tipo, ErrorTool solo acepta los códigos base', () => {
    expectTypeOf(new ErrorTool('BASE_NO_DISPONIBLE', 'x').codigo).toEqualTypeOf<CodigoBase>();
    // @ts-expect-error un código que no es base no se infiere del argumento
    new ErrorTool('RECURSO_NO_ENCONTRADO', 'x');
  });

  it('el ErrorTool de una app acepta sus códigos y rechaza los ajenos', () => {
    expectTypeOf(new ErrorApp('RECURSO_NO_ENCONTRADO', 'x').codigo).toEqualTypeOf<CodigoApp>();
    // @ts-expect-error TICKET_NO_ENCONTRADO no está en la lista de la app
    new ErrorApp('TICKET_NO_ENCONTRADO', 'x');
  });

  it('la lista de un servidor tiene que incluir los códigos base', () => {
    expectTypeOf<CodigosError<typeof CODIGOS_APP>>().toEqualTypeOf<typeof CODIGOS_APP>();
    expectTypeOf<CodigosError<readonly ['PARAMETRO_INVALIDO', 'ERROR_INTERNO']>>().toEqualTypeOf<{
      faltanCodigosBase: 'NO_AUTORIZADO' | 'BASE_NO_DISPONIBLE';
    }>();

    const { logger } = loggerEnMemoria();
    const comunes = { nombre: 'x', version: '0', logger, sesion: { codUsuario: 1 } };
    crearServidorMcp([], { ...comunes, codigosError: CODIGOS_APP });
    // @ts-expect-error falta BASE_NO_DISPONIBLE
    crearServidorMcp([], { ...comunes, codigosError: ['PARAMETRO_INVALIDO', 'NO_AUTORIZADO', 'ERROR_INTERNO'] });
  });
});

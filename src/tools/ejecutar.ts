import type { Logger } from 'pino';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Sesion } from '../auth/sesion.js';
import { ErrorTool, normalizarError, resultadoError, type CodigoError } from '../errores.js';
import type { DefinicionTool, Medidor } from './definicion.js';

/** Caracteres que lee un cliente: el texto del content, que ya incluye el JSON de los datos. */
export function contarCaracteres(resultado: CallToolResult): number {
  return resultado.content.reduce((total, c) => total + (c.type === 'text' ? c.text.length : 0), 0);
}

/**
 * Wrapper común de todas las tools: valida el input con zod, ejecuta el handler, convierte
 * errores a la forma uniforme y emite un evento de log por invocación.
 */
export async function ejecutarTool<I, O>(
  definicion: DefinicionTool<I, O>,
  argumentos: unknown,
  sesion: Sesion,
  logger: Logger,
): Promise<CallToolResult> {
  const inicio = performance.now();
  const medidor: Medidor = { llamadasBase: 0 };
  let resultado: CallToolResult;
  let codigoError: CodigoError | undefined;

  try {
    const entrada = definicion.entrada.safeParse(argumentos ?? {});
    if (!entrada.success) {
      throw new ErrorTool(
        'PARAMETRO_INVALIDO',
        'Parámetros inválidos',
        entrada.error.issues.map((i) => ({ campo: i.path.join('.') || '(raíz)', mensaje: i.message })),
      );
    }
    const { datos, resumen } = await definicion.ejecutar(entrada.data, { sesion, logger, medidor });
    // El JSON va también como texto: hay clientes (Claude Desktop) que solo le pasan content al modelo.
    resultado = {
      content: [
        { type: 'text', text: resumen },
        { type: 'text', text: JSON.stringify(datos) },
      ],
      structuredContent: datos as Record<string, unknown>,
    };
  } catch (error) {
    const errorTool = normalizarError(error);
    if (!(error instanceof ErrorTool)) {
      logger.error({ err: error, tool: definicion.nombre }, 'Error inesperado en una tool');
    }
    codigoError = errorTool.codigo;
    resultado = resultadoError(errorTool);
  }

  logger.info(
    {
      evento: 'invocacion_tool',
      tool: definicion.nombre,
      codUsuario: sesion.codUsuario,
      duracionMs: Math.round(performance.now() - inicio),
      llamadasBase: medidor.llamadasBase,
      caracteresRespuesta: contarCaracteres(resultado),
      ...(codigoError ? { codigoError } : {}),
    },
    'Invocación de tool',
  );
  return resultado;
}

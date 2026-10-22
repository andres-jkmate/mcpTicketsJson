import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** Códigos que comparten todos los MCPs, con el mismo significado en todos. */
export const CODIGOS_BASE = ['PARAMETRO_INVALIDO', 'NO_AUTORIZADO', 'BASE_NO_DISPONIBLE', 'ERROR_INTERNO'] as const;

export type CodigoBase = (typeof CODIGOS_BASE)[number];

/**
 * Lista de códigos de un servidor. Si le falta alguno de los códigos base, el tipo deja de ser la
 * lista y pasa a ser un objeto que nombra los que faltan, así que no compila.
 */
export type CodigosError<L extends readonly string[]> = [Exclude<CodigoBase, L[number]>] extends [never]
  ? L
  : { faltanCodigosBase: Exclude<CodigoBase, L[number]> };

export interface ErrorSerializado<C extends string = string> {
  codigo: C;
  mensaje: string;
  detalle?: unknown;
}

/**
 * Error de negocio o de validación que la tool devuelve al agente con un código estable.
 * El código no se infiere del argumento: sin parámetro de tipo solo acepta los códigos base. Cada
 * app declara su propia clase con sus códigos (`class ErrorTool extends ErrorToolBase<CodigoError>`),
 * así un código que su servidor no declaró no compila.
 */
export class ErrorTool<C extends string = CodigoBase> extends Error {
  readonly codigo: C;
  readonly detalle?: unknown;

  constructor(codigo: NoInfer<C>, mensaje: string, detalle?: unknown) {
    super(mensaje);
    this.name = 'ErrorTool';
    this.codigo = codigo;
    if (detalle !== undefined) this.detalle = detalle;
  }

  serializar(): ErrorSerializado<C> {
    return {
      codigo: this.codigo,
      mensaje: this.message,
      ...(this.detalle !== undefined ? { detalle: this.detalle } : {}),
    };
  }
}

const MENSAJE_INTERNO = 'Ocurrió un error inesperado. El detalle quedó registrado en el log del servidor.';

/**
 * Normaliza cualquier error a la forma que ve el agente. Lo que no es `ErrorTool` sale como
 * `ERROR_INTERNO` sin detalle: nunca trazas, SQL ni credenciales.
 */
export function normalizarError(error: unknown): ErrorTool<string> {
  if (error instanceof ErrorTool) return error;
  return new ErrorTool('ERROR_INTERNO', MENSAJE_INTERNO);
}

export function resultadoError(error: ErrorTool<string>): CallToolResult {
  const serializado = error.serializar();
  return {
    isError: true,
    content: [{ type: 'text', text: `${serializado.codigo}: ${serializado.mensaje}` }],
    structuredContent: { error: serializado },
  };
}

/** JSON Schema del objeto `error` con los códigos del servidor, que se agrega a todo outputSchema (ver `conError`). */
export function esquemaError(codigos: readonly string[]) {
  return {
    type: 'object',
    properties: {
      codigo: { enum: [...codigos] },
      mensaje: { type: 'string' },
      detalle: {},
    },
    required: ['codigo', 'mensaje'],
  } as const;
}

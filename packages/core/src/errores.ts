import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const CODIGOS_ERROR = [
  'PARAMETRO_INVALIDO',
  'TICKET_NO_ENCONTRADO',
  'NO_AUTORIZADO',
  'BASE_NO_DISPONIBLE',
  'ERROR_INTERNO',
] as const;

export type CodigoError = (typeof CODIGOS_ERROR)[number];

export interface ErrorSerializado {
  codigo: CodigoError;
  mensaje: string;
  detalle?: unknown;
}

/** Error de negocio o de validación que la tool devuelve al agente con un código estable. */
export class ErrorTool extends Error {
  readonly codigo: CodigoError;
  readonly detalle?: unknown;

  constructor(codigo: CodigoError, mensaje: string, detalle?: unknown) {
    super(mensaje);
    this.name = 'ErrorTool';
    this.codigo = codigo;
    if (detalle !== undefined) this.detalle = detalle;
  }

  serializar(): ErrorSerializado {
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
export function normalizarError(error: unknown): ErrorTool {
  if (error instanceof ErrorTool) return error;
  return new ErrorTool('ERROR_INTERNO', MENSAJE_INTERNO);
}

export function resultadoError(error: ErrorTool): CallToolResult {
  const serializado = error.serializar();
  return {
    isError: true,
    content: [{ type: 'text', text: `${serializado.codigo}: ${serializado.mensaje}` }],
    structuredContent: { error: serializado },
  };
}

/** JSON Schema del objeto `error`, que se agrega a todo outputSchema (ver `conError`). */
export const ESQUEMA_ERROR = {
  type: 'object',
  properties: {
    codigo: { enum: [...CODIGOS_ERROR] },
    mensaje: { type: 'string' },
    detalle: {},
  },
  required: ['codigo', 'mensaje'],
} as const;

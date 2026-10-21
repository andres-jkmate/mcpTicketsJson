import type { Logger } from 'pino';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';
import type { Sesion } from '../auth/sesion.js';
import { ESQUEMA_ERROR } from '../errores.js';

export type EsquemaJson = Record<string, unknown>;

/** Cuenta las llamadas a la base que hace una invocación (va al evento de log). */
export interface Medidor {
  llamadasBase: number;
}

export interface ContextoTool {
  sesion: Sesion;
  logger: Logger;
  medidor: Medidor;
}

export interface RespuestaTool<O> {
  datos: O;
  /** Resumen en texto para clientes que no leen structuredContent. */
  resumen: string;
}

export interface DefinicionTool<I = unknown, O = unknown> {
  nombre: string;
  titulo: string;
  descripcion: string;
  /** JSON Schema publicado en tools/list, tal cual el design. */
  inputSchema: EsquemaJson;
  /** JSON Schema de éxito; al publicarse se le agrega la forma de error con `conError`. */
  outputSchema: EsquemaJson;
  annotations: ToolAnnotations;
  /** Validador real del input (aplica defaults). Un fallo es PARAMETRO_INVALIDO. */
  entrada: z.ZodType<I>;
  ejecutar(args: I, ctx: ContextoTool): Promise<RespuestaTool<O>>;
}

/**
 * Agrega a un outputSchema de éxito la forma `{ error }`: el cliente del SDK TS valida
 * structuredContent contra el outputSchema aunque isError sea true.
 */
export function conError(esquema: EsquemaJson): EsquemaJson {
  const { required, properties, ...resto } = esquema as {
    required?: string[];
    properties?: Record<string, unknown>;
  } & EsquemaJson;
  return {
    ...resto,
    type: 'object',
    properties: { ...(properties ?? {}), error: ESQUEMA_ERROR },
    anyOf: [{ required: required ?? [] }, { required: ['error'] }],
  };
}

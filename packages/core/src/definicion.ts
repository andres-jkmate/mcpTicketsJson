import type { Logger } from 'pino';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';
import type { Sesion } from './sesion.js';
import { esquemaError } from './errores.js';

export type EsquemaJson = Record<string, unknown>;

/** Cuenta las llamadas a la base que hace una invocación (va al evento de log). */
export interface Medidor {
  llamadasBase: number;
}

export interface ContextoTool<S extends Sesion = Sesion> {
  sesion: S;
  /** Logger de la invocación: todo lo que se loguee con él lleva el `idCorrelacion` de la llamada. */
  logger: Logger;
  medidor: Medidor;
}

export interface RespuestaTool<O> {
  datos: O;
  /** Resumen en texto para clientes que no leen structuredContent. */
  resumen: string;
}

export interface DefinicionTool<I = unknown, O = unknown, S extends Sesion = Sesion> {
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
  ejecutar(args: I, ctx: ContextoTool<S>): Promise<RespuestaTool<O>>;
}

/**
 * Agrega a un outputSchema de éxito la forma `{ error }` con los códigos del servidor: el cliente
 * del SDK TS valida structuredContent contra el outputSchema aunque isError sea true.
 */
export function conError(esquema: EsquemaJson, codigos: readonly string[]): EsquemaJson {
  const { required, properties, ...resto } = esquema as {
    required?: string[];
    properties?: Record<string, unknown>;
  } & EsquemaJson;
  return {
    ...resto,
    type: 'object',
    properties: { ...(properties ?? {}), error: esquemaError(codigos) },
    anyOf: [{ required: required ?? [] }, { required: ['error'] }],
  };
}

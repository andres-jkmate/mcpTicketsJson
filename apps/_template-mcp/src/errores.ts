import { ErrorTool as ErrorToolBase } from '@mcp-jkmate/core';

/**
 * Códigos que publica este MCP: los cuatro base más los propios del dominio, en el orden en que
 * aparecen en el enum de cada outputSchema. Si falta un código base, el servidor no compila.
 */
export const CODIGOS_ERROR = [
  'PARAMETRO_INVALIDO',
  'EJEMPLO_NO_ENCONTRADO',
  'NO_AUTORIZADO',
  'BASE_NO_DISPONIBLE',
  'ERROR_INTERNO',
] as const;

export type CodigoError = (typeof CODIGOS_ERROR)[number];

/** Error de tool de este MCP: solo acepta los códigos de `CODIGOS_ERROR`. */
export class ErrorTool extends ErrorToolBase<CodigoError> {}

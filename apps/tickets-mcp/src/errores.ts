import { ErrorTool as ErrorToolBase } from '@mcp-jkmate/core';

/** Códigos que publica el MCP de tickets: los base más los propios, en el orden del contrato. */
export const CODIGOS_ERROR = [
  'PARAMETRO_INVALIDO',
  'TICKET_NO_ENCONTRADO',
  'NO_AUTORIZADO',
  'BASE_NO_DISPONIBLE',
  'ERROR_INTERNO',
] as const;

export type CodigoError = (typeof CODIGOS_ERROR)[number];

/** Error de tool de tickets: solo acepta los códigos de `CODIGOS_ERROR`. */
export class ErrorTool extends ErrorToolBase<CodigoError> {}

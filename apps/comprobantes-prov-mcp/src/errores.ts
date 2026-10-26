import { ErrorTool as ErrorToolBase } from '@mcp-jkmate/core';

/**
 * Códigos que publica este MCP, en el orden en que aparecen en el enum de cada outputSchema: los
 * cuatro base y los del dominio que usan las tools. Si falta un código base, el servidor no compila.
 */
export const CODIGOS_ERROR = [
  'PARAMETRO_INVALIDO',
  'NO_AUTORIZADO',
  'BASE_NO_DISPONIBLE',
  'ERROR_INTERNO',
  'COMPROBANTE_DUPLICADO',
  'PERIODO_CERRADO',
] as const;

/**
 * Códigos del dominio que los SP señalan con `RESULTADO = 0` y `MENSAJE_ERROR` prefijado
 * (`COMPROBANTE_DUPLICADO: …`); se pasan a `aplicarContrato`.
 */
export const CODIGOS_DOMINIO = ['COMPROBANTE_DUPLICADO', 'PERIODO_CERRADO'] as const satisfies readonly (typeof CODIGOS_ERROR)[number][];

export type CodigoError = (typeof CODIGOS_ERROR)[number];

/** Error de tool de este MCP: solo acepta los códigos de `CODIGOS_ERROR`. */
export class ErrorTool extends ErrorToolBase<CodigoError> {}

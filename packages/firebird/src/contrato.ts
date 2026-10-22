import { ErrorTool } from '@mcp-jkmate/core';
import type { Fila } from './acceso.js';

const PREFIJO_NO_AUTORIZADO = 'NO_AUTORIZADO:';

/**
 * Contrato de los selectables: 1 fila con RESULTADO = 0 es un error de validación; si no, cada
 * fila trae RESULTADO = 1. Cero filas = sin datos.
 */
export function aplicarContrato<T>(nombreSp: string, filas: Fila[]): T[] {
  const primera = filas[0];
  if (primera && primera.RESULTADO === 0) {
    const mensaje = String(primera.MENSAJE_ERROR ?? '').trim() || `Parámetros inválidos para ${nombreSp}`;
    if (mensaje.startsWith(PREFIJO_NO_AUTORIZADO)) {
      throw new ErrorTool('NO_AUTORIZADO', mensaje.slice(PREFIJO_NO_AUTORIZADO.length).trim());
    }
    throw new ErrorTool('PARAMETRO_INVALIDO', mensaje);
  }
  return filas.map((fila) => {
    const { RESULTADO: _r, MENSAJE_ERROR: _m, ...resto } = fila;
    return resto as T;
  });
}

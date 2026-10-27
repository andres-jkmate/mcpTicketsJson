import type { CualquierTool } from '@mcp-jkmate/core';
import type { AccesoDatos } from '@mcp-jkmate/firebird';
import { crearBuscarMovimientosFondos } from './buscar-movimientos-fondos.js';
import { crearVerMovimientoFondo } from './ver-movimiento-fondo.js';

export interface DependenciasTools {
  acceso: AccesoDatos;
  /** Fecha del día 'AAAA-MM-DD' (se inyecta en los tests). */
  hoy?: () => string;
  /** Zona de la base para las fechas con hora (se inyecta en los tests). */
  zonaHoraria?: string;
}

/** Las tools que publica el servidor: las dos de consulta de movimientos de fondos (solo lectura). */
export function crearTools(deps: DependenciasTools): CualquierTool[] {
  return [crearBuscarMovimientosFondos(deps), crearVerMovimientoFondo(deps)];
}

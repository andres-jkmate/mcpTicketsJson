import type { CualquierTool } from '@mcp-jkmate/core';
import type { AccesoDatos } from '@mcp-jkmate/firebird';
import { crearObtenerEjemplo } from './obtener-ejemplo.js';

export interface DependenciasTools {
  acceso: AccesoDatos;
}

/** Las tools que publica el servidor. */
export function crearTools(deps: DependenciasTools): CualquierTool[] {
  return [crearObtenerEjemplo(deps)];
}

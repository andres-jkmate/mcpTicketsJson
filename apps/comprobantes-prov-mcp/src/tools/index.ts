import type { CualquierTool } from '@mcp-jkmate/core';
import type { AccesoDatos } from '@mcp-jkmate/firebird';
import { crearPrepararFacturaProveedor } from './preparar-factura-proveedor.js';
import { crearRegistrarFacturaProveedor } from './registrar-factura-proveedor.js';

export interface DependenciasTools {
  acceso: AccesoDatos;
  /** Fecha del día 'AAAA-MM-DD' (se inyecta en los tests). */
  hoy?: () => string;
}

/** Las tools que publica el servidor: preparar (solo lectura) y registrar (escritura). */
export function crearTools(deps: DependenciasTools): CualquierTool[] {
  return [crearPrepararFacturaProveedor(deps), crearRegistrarFacturaProveedor(deps)];
}

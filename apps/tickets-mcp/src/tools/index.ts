import type { CualquierTool } from '@mcp-jkmate/core';
import type { AccesoDatos } from '@mcp-jkmate/firebird';
import type { SesionTickets } from '../sesion.js';
import { crearListarTareas } from './listar-tareas.js';
import { crearListarTickets } from './listar-tickets.js';
import { crearObtenerContextoTicket } from './obtener-contexto-ticket.js';
import { crearResumirTickets } from './resumir-tickets.js';

export interface DependenciasTools {
  acceso: AccesoDatos;
  zonaHoraria: string;
}

/** Las tools que publica el servidor. */
export function crearTools(deps: DependenciasTools): CualquierTool<SesionTickets>[] {
  return [crearObtenerContextoTicket(deps), crearListarTickets(deps), crearListarTareas(deps), crearResumirTickets(deps)];
}

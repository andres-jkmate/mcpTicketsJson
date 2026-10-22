import type { AccesoDatos } from '../db/firebird.js';
import type { DefinicionTool } from './definicion.js';
import { crearListarTareas } from './listar-tareas.js';
import { crearListarTickets } from './listar-tickets.js';
import { crearObtenerContextoTicket } from './obtener-contexto-ticket.js';
import { crearResumirTickets } from './resumir-tickets.js';

export interface DependenciasTools {
  acceso: AccesoDatos;
  zonaHoraria: string;
}

/** Las tools que publica el servidor. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function crearTools(deps: DependenciasTools): DefinicionTool<any, any>[] {
  return [crearObtenerContextoTicket(deps), crearListarTickets(deps), crearListarTareas(deps), crearResumirTickets(deps)];
}

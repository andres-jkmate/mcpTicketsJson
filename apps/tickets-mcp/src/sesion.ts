import type { Sesion } from '@mcp-jkmate/core';

/** Sesión de tickets: suma el desarrollador del usuario, que se resuelve una vez al arrancar. */
export interface SesionTickets extends Sesion {
  /** USUARIOS.COD_DESARROLLADOR del usuario de la sesión; null si no es desarrollador. */
  codDesarrollador: number | null;
}

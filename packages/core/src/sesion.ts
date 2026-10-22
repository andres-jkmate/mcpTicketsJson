/**
 * Identidad del usuario que usa el servidor. Sale de la configuración del proceso
 * (MCP_COD_USUARIO), nunca de un parámetro de tool. Cada app la extiende con lo que necesite
 * resolver al arrancar (por ejemplo, tickets suma `codDesarrollador`).
 */
export interface Sesion {
  codUsuario: number;
}

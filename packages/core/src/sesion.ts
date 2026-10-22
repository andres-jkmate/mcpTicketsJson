/**
 * Identidad del usuario que usa el servidor. Sale de la configuración del proceso
 * (MCP_COD_USUARIO), nunca de un parámetro de tool.
 */
export interface Sesion {
  codUsuario: number;
  /** USUARIOS.COD_DESARROLLADOR del usuario de la sesión; null si no es desarrollador. */
  codDesarrollador: number | null;
}

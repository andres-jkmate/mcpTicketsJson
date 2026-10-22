import type { AccesoDatos } from '@mcp-jkmate/firebird';

/** USUARIOS.COD_DESARROLLADOR del usuario, o null. Consulta fija: no recibe input de tools. */
export async function codDesarrolladorDeUsuario(acceso: AccesoDatos, codUsuario: number): Promise<number | null> {
  const filas = await acceso.consultar<{ COD_DESARROLLADOR: number | null }>(
    'SELECT COD_DESARROLLADOR FROM USUARIOS WHERE COD_USUARIO = ?',
    [codUsuario],
  );
  return filas[0]?.COD_DESARROLLADOR ?? null;
}

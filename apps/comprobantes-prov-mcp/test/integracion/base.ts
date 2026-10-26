import { crearAccesoFirebird, type AccesoDatos } from '@mcp-jkmate/firebird';

/**
 * Integración contra la copia local de CREAR (CREAR_JK3_20261016): solo corre si hay FIREBIRD_* en
 * el entorno y la base ya tiene los SP `_AG` de db/procedimientos (tarea 5.2).
 */
export const hayBase = Boolean(process.env.FIREBIRD_DATABASE);

export function accesoDesdeEntorno(): AccesoDatos {
  const env = process.env;
  return crearAccesoFirebird({
    FIREBIRD_HOST: env.FIREBIRD_HOST ?? '127.0.0.1',
    FIREBIRD_PORT: Number(env.FIREBIRD_PORT ?? 3050),
    FIREBIRD_DATABASE: env.FIREBIRD_DATABASE ?? '',
    FIREBIRD_USER: env.FIREBIRD_USER ?? 'SYSDBA',
    FIREBIRD_PASSWORD: env.FIREBIRD_PASSWORD,
    FIREBIRD_POOL_MAX: 2,
  });
}

/** true si la base tiene los SP `_AG` de este MCP. */
export async function hayProcedimientosAg(): Promise<boolean> {
  if (!hayBase) return false;
  const acceso = accesoDesdeEntorno();
  try {
    const filas = await acceso.consultar(
      "SELECT COUNT(*) AS N FROM RDB$PROCEDURES WHERE RDB$PROCEDURE_NAME IN ('PROC_LIST_PERFIL_OPC_AG', 'PROC_INS_FIN_FAC_PROV_AG', 'PROC_LIST_CUOTAS_FC_AG')",
      [],
    );
    return Number(filas[0]?.N) === 3;
  } catch {
    return false;
  } finally {
    await acceso.cerrar();
  }
}

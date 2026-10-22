import { crearAccesoFirebird, type AccesoDatos } from '@mcp-jkmate/firebird';

/**
 * Integración contra la base de desarrollo: solo corre si hay FIREBIRD_* en el entorno.
 * Los tests que usan los SP `_AG` además se saltean hasta que se ejecute el DDL (tarea 1.3).
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

/** true si la base ya tiene los SP públicos `_AG` (DDL de la tarea 1.3 aplicado). */
export async function hayProcedimientosAg(): Promise<boolean> {
  if (!hayBase) return false;
  const acceso = accesoDesdeEntorno();
  try {
    const filas = await acceso.enTransaccion((sp) => sp('PROC_GET_TICKET_AG', [74836]));
    return filas.length > 0;
  } catch {
    return false;
  } finally {
    await acceso.cerrar();
  }
}

/** Consulta SQL directa, solo para tests que comparan enums contra tablas de catálogo. */
export async function consultarDirecto<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const env = process.env;
  const Firebird = (await import('node-firebird')).default;
  const db = await Firebird.attachAsync({
    host: env.FIREBIRD_HOST ?? '127.0.0.1',
    port: Number(env.FIREBIRD_PORT ?? 3050),
    database: env.FIREBIRD_DATABASE,
    user: env.FIREBIRD_USER ?? 'SYSDBA',
    password: env.FIREBIRD_PASSWORD ?? '',
    encoding: 'UTF8',
  });
  try {
    return await db.queryAsync<T>(sql);
  } finally {
    await db.detachAsync();
  }
}

import Firebird from 'node-firebird';
import { ErrorTool, type Medidor } from '@mcp-jkmate/core';

/** Fila de un SP: columnas en mayúsculas, como las devuelve Firebird. */
export type Fila = Record<string, unknown>;

/** Valor aceptado como parámetro de SP. Las fechas se pasan como texto 'AAAA-MM-DD'. */
export type ValorParametro = string | number | null;

export type EjecutarSp = (nombre: string, parametros: ValorParametro[]) => Promise<Fila[]>;

export interface AccesoDatos {
  /**
   * Ejecuta `trabajo` dentro de una única transacción de solo lectura (snapshot consistente).
   * Cada llamada a `ejecutarSp` suma 1 en `medidor.llamadasBase`.
   */
  enTransaccion<T>(trabajo: (ejecutarSp: EjecutarSp) => Promise<T>, medidor?: Medidor): Promise<T>;
  /**
   * Ejecuta una consulta fija fuera de los SP (por ejemplo, para resolver la sesión al arrancar).
   * USO RESTRINGIDO: `sql` tiene que ser una constante escrita en el código, nunca armada con el
   * input de una tool; los valores van siempre como `parametros`. Todo lo que viene de una tool
   * pasa por `enTransaccion` y un SP.
   */
  consultar<T extends Fila = Fila>(sql: string, parametros: ValorParametro[]): Promise<T[]>;
  cerrar(): Promise<void>;
}

const NOMBRE_SP = /^[A-Z][A-Z0-9_$]{0,30}$/;

/**
 * node-firebird arma TIMESTAMP/DATE como hora de reloj en la zona del proceso, pero usando el
 * offset de 1970. Deshace exactamente esa cuenta y devuelve un "reloj" (campos UTC = hora de la
 * base), que es lo que espera mapeo/fecha.ts. No depende de la zona del proceso ni de DST.
 */
export function relojDesdeDriver(valor: Date): Date {
  return new Date(valor.getTime() - new Date(0).getTimezoneOffset() * 60_000);
}

function normalizarFila(fila: Fila): Fila {
  for (const [clave, valor] of Object.entries(fila)) {
    if (valor instanceof Date) fila[clave] = relojDesdeDriver(valor);
    else if (Buffer.isBuffer(valor)) fila[clave] = valor.toString('utf8');
  }
  return fila;
}

const CODIGOS_RED = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND', 'EPIPE']);
/** gdscodes de Firebird que significan "la base no está disponible" (red, conexión perdida, shutdown, login). */
const GDS_NO_DISPONIBLE = new Set([
  335544721, // network_error
  335544726, // net_read_err
  335544727, // net_write_err
  335544741, // lost_db_connection
  335544375, // unavailable
  335544528, // shutdown
  335544472, // login (credenciales del MCP mal configuradas)
  335544344, // io_error
]);

export function esBaseNoDisponible(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; gdscode?: unknown; message?: unknown };
  if (typeof e.code === 'string' && CODIGOS_RED.has(e.code)) return true;
  if (typeof e.gdscode === 'number' && GDS_NO_DISPONIBLE.has(e.gdscode)) return true;
  const mensaje = typeof e.message === 'string' ? e.message : '';
  return /connection (is )?(lost|closed|shutdown)|socket|timeout/i.test(mensaje);
}

export const MENSAJE_NO_DISPONIBLE = 'La base de datos no está disponible en este momento. Reintentá en unos minutos.';

export interface ConfigFirebird {
  FIREBIRD_HOST: string;
  FIREBIRD_PORT: number;
  FIREBIRD_DATABASE: string;
  FIREBIRD_USER: string;
  FIREBIRD_PASSWORD?: string | undefined;
  FIREBIRD_POOL_MAX: number;
}

export interface OpcionesAccesoFirebird {
  /** Mensaje de BASE_NO_DISPONIBLE que ve el agente (cada MCP puede nombrar su base). */
  mensajeNoDisponible?: string;
  connectTimeout?: number;
}

export function crearAccesoFirebird(config: ConfigFirebird, opcionesExtra: OpcionesAccesoFirebird = {}): AccesoDatos {
  if (!config.FIREBIRD_DATABASE) throw new Error('Falta FIREBIRD_DATABASE');
  const mensajeNoDisponible = opcionesExtra.mensajeNoDisponible ?? MENSAJE_NO_DISPONIBLE;

  /** Convierte errores de conexión en BASE_NO_DISPONIBLE; el resto sigue igual (sale como ERROR_INTERNO). */
  function traducir(error: unknown): unknown {
    return esBaseNoDisponible(error) ? new ErrorTool('BASE_NO_DISPONIBLE', mensajeNoDisponible) : error;
  }

  const pool = Firebird.pool(config.FIREBIRD_POOL_MAX, {
    host: config.FIREBIRD_HOST,
    port: config.FIREBIRD_PORT,
    database: config.FIREBIRD_DATABASE,
    user: config.FIREBIRD_USER,
    password: config.FIREBIRD_PASSWORD ?? '',
    encoding: 'UTF8',
    blobAsText: true,
    numericMode: 'lossy',
    connectTimeout: opcionesExtra.connectTimeout ?? 10_000,
    idleTimeoutMillis: 60_000,
  });
  // Los errores del pool se propagan en cada operación; sin listener, node los trataría como no manejados.
  pool.on('error', () => undefined);

  async function conConexion<T>(trabajo: (db: Firebird.Database) => Promise<T>): Promise<T> {
    let db: Firebird.Database;
    try {
      db = await pool.getAsync();
    } catch (error) {
      throw traducir(error);
    }
    try {
      return await trabajo(db);
    } finally {
      db.detach(() => undefined); // en un pool, detach devuelve la conexión
    }
  }

  return {
    async enTransaccion(trabajo, medidor) {
      return conConexion(async (db) => {
        let tx: Firebird.Transaction;
        try {
          tx = await db.transactionAsync({ isolation: Firebird.ISOLATION_REPEATABLE_READ, readOnly: true, wait: false });
        } catch (error) {
          throw traducir(error);
        }
        const ejecutarSp: EjecutarSp = async (nombre, parametros) => {
          if (!NOMBRE_SP.test(nombre)) throw new Error(`Nombre de SP inválido: ${nombre}`);
          if (medidor) medidor.llamadasBase += 1;
          const marcadores = parametros.map(() => '?').join(', ');
          const sql = `SELECT * FROM ${nombre}${parametros.length ? `(${marcadores})` : ''}`;
          try {
            const filas = await tx.queryAsync<Fila>(sql, parametros);
            return filas.map(normalizarFila);
          } catch (error) {
            throw traducir(error);
          }
        };
        try {
          const resultado = await trabajo(ejecutarSp);
          await tx.commitAsync().catch(() => undefined);
          return resultado;
        } catch (error) {
          await tx.rollbackAsync().catch(() => undefined);
          throw error;
        }
      });
    },

    async consultar<T extends Fila = Fila>(sql: string, parametros: ValorParametro[]) {
      return conConexion(async (db) => {
        try {
          const filas = await db.queryAsync<Fila>(sql, parametros);
          return filas.map(normalizarFila) as T[];
        } catch (error) {
          throw traducir(error);
        }
      });
    },

    async cerrar() {
      await pool.destroyAsync();
    },
  };
}

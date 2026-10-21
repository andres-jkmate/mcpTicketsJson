import { afterAll, describe, expect, it } from 'vitest';
import { aFechaHoraIso } from '../mapeo/fecha.js';
import { ErrorTool } from '../errores.js';
import { crearAccesoFirebird, esBaseNoDisponible, relojDesdeDriver, type AccesoDatos } from './firebird.js';

describe('db/firebird (unitario)', () => {
  it('relojDesdeDriver deshace la cuenta de node-firebird sin importar la zona del proceso', () => {
    // node-firebird: new Date(0) + (ms de reloj) + offset de 1970 en minutos.
    const relojMs = Date.UTC(2026, 8, 28, 15, 44, 11, 925);
    const delDriver = new Date(relojMs + new Date(0).getTimezoneOffset() * 60_000);
    expect(aFechaHoraIso(relojDesdeDriver(delDriver), 'America/Argentina/Buenos_Aires')).toBe(
      '2026-09-28T15:44:11.925-03:00',
    );
  });

  it('reconoce errores de base no disponible', () => {
    expect(esBaseNoDisponible(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toBe(true);
    expect(esBaseNoDisponible(Object.assign(new Error('x'), { gdscode: 335544721 }))).toBe(true);
    expect(esBaseNoDisponible(Object.assign(new Error('Column unknown'), { gdscode: 335544578 }))).toBe(false);
  });

  it('una base inalcanzable responde BASE_NO_DISPONIBLE sin detalles de conexión', async () => {
    const acceso = crearAccesoFirebird(
      {
        FIREBIRD_HOST: '127.0.0.1',
        FIREBIRD_PORT: 1,
        FIREBIRD_DATABASE: 'C:\\no\\existe.fdb',
        FIREBIRD_USER: 'SYSDBA',
        FIREBIRD_PASSWORD: 'secreto',
        FIREBIRD_POOL_MAX: 1,
      },
      { connectTimeout: 2000 },
    );
    const error = await acceso.enTransaccion((sp) => sp('PROC_GET_TICKET_AG', [1])).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorTool);
    expect((error as ErrorTool).codigo).toBe('BASE_NO_DISPONIBLE');
    expect((error as ErrorTool).message).not.toMatch(/127\.0\.0\.1|secreto|existe\.fdb/);
    await acceso.cerrar();
  });
});

const env = process.env;
const hayBase = Boolean(env.FIREBIRD_DATABASE);

describe.skipIf(!hayBase)('db/firebird (integración contra la base de desarrollo)', () => {
  let acceso: AccesoDatos;

  afterAll(async () => {
    await acceso?.cerrar();
  });

  it('ejecuta un SP de la v1 dentro de una transacción de solo lectura y cuenta las llamadas', async () => {
    acceso = crearAccesoFirebird({
      FIREBIRD_HOST: env.FIREBIRD_HOST ?? '127.0.0.1',
      FIREBIRD_PORT: Number(env.FIREBIRD_PORT ?? 3050),
      FIREBIRD_DATABASE: env.FIREBIRD_DATABASE ?? '',
      FIREBIRD_USER: env.FIREBIRD_USER ?? 'SYSDBA',
      FIREBIRD_PASSWORD: env.FIREBIRD_PASSWORD,
      FIREBIRD_POOL_MAX: 2,
    });
    const medidor = { llamadasBase: 0 };
    const [detalle, adjuntos] = await acceso.enTransaccion(
      (sp) => Promise.all([sp('PROC_GET_INFO_TICKET_PORTAL', [74836]), sp('PROC_GET_ARCHIVO_ADJ_SAC_X_RECL', [74836])]),
      medidor,
    );
    expect(medidor.llamadasBase).toBe(2);
    expect(detalle).toHaveLength(1);
    const fila = detalle[0]!;
    expect(fila.ESTADO).toBeTypeOf('string');
    expect(aFechaHoraIso(fila.FECHA_CREACION as Date, 'America/Argentina/Buenos_Aires')).toBe(
      '2026-09-28T15:44:11.925-03:00',
    );
    expect(adjuntos).toHaveLength(2);
  });

  it('translitera ISO8859_1 a UTF8 sin mojibake', async () => {
    const hitos = await acceso.enTransaccion((sp) => sp('PROC_GET_HITOS_TICKET_PORTAL', [74111, 0]));
    const resultados = hitos.map((h) => h.RESULTADO_RECLAMO as string);
    expect(resultados).toContain('PRESUPUESTO PENDIENTE APROBACIÓN');
    expect(JSON.stringify(hitos)).not.toMatch(/Ã/);
  });

  it('resuelve el desarrollador del usuario de la sesión', async () => {
    expect(await acceso.codDesarrolladorDeUsuario(15169)).toBe(100936);
  });

  it('la transacción es de solo lectura', async () => {
    const error = await acceso
      .enTransaccion((sp) => sp('PROC_GET_INFO_TICKET_PORTAL', [74836]).then(() => sp('NO_EXISTE_SP_AG', [])))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
  });
});

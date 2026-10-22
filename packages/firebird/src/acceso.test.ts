import { describe, expect, it } from 'vitest';
import { ErrorTool } from '@mcp-jkmate/core';
import { aFechaHoraIso } from './mapeo/fecha.js';
import { crearAccesoFirebird, esBaseNoDisponible, MENSAJE_NO_DISPONIBLE, relojDesdeDriver, type ConfigFirebird } from './acceso.js';

/** Puerto 1: la conexión se rechaza enseguida, sin base real. */
const INALCANZABLE: ConfigFirebird = {
  FIREBIRD_HOST: '127.0.0.1',
  FIREBIRD_PORT: 1,
  FIREBIRD_DATABASE: 'C:\\no\\existe.fdb',
  FIREBIRD_USER: 'SYSDBA',
  FIREBIRD_PASSWORD: 'secreto',
  FIREBIRD_POOL_MAX: 1,
};

describe('acceso a Firebird (unitario)', () => {
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
    const acceso = crearAccesoFirebird(INALCANZABLE, { connectTimeout: 2000 });
    const error = await acceso.enTransaccion((sp) => sp('PROC_GET_TICKET_AG', [1])).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorTool);
    expect((error as ErrorTool).codigo).toBe('BASE_NO_DISPONIBLE');
    expect((error as ErrorTool).message).toBe(MENSAJE_NO_DISPONIBLE);
    expect((error as ErrorTool).message).not.toMatch(/127\.0\.0\.1|secreto|existe\.fdb/);
    await acceso.cerrar();
  });

  it('consultar traduce un error de red a BASE_NO_DISPONIBLE con el mensaje configurado', async () => {
    const mensajeNoDisponible = 'La base de prueba no está disponible.';
    const acceso = crearAccesoFirebird(INALCANZABLE, { connectTimeout: 2000, mensajeNoDisponible });
    const error = await acceso.consultar('SELECT 1 FROM RDB$DATABASE', []).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorTool);
    expect(error).toMatchObject({ codigo: 'BASE_NO_DISPONIBLE', message: mensajeNoDisponible });
    await acceso.cerrar();
  });
});

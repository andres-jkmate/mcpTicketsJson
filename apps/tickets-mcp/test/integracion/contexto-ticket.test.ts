import { afterAll, describe, expect, it } from 'vitest';
import type { AccesoDatos } from '@mcp-jkmate/firebird';
import { ESTADOS_TAREA, ESTADOS_TICKET, PRIORIDADES_TICKET, SISTEMAS } from '../../src/tools/esquemas.js';
import { crearObtenerContextoTicket, type ContextoTicket } from '../../src/tools/obtener-contexto-ticket.js';
import { conectarCliente } from '../apoyo.js';
import { accesoDesdeEntorno, consultarDirecto, hayBase, hayProcedimientosAg } from './base.js';

const ZONA = 'America/Argentina/Buenos_Aires';
const hayAg = await hayProcedimientosAg();

describe.skipIf(!hayBase)('enums contra la base', () => {
  it('estadoTicket coincide con ESTADOS_RECLAMOS', async () => {
    const filas = await consultarDirecto<{ ESTADO: string }>('SELECT TRIM(ESTADO) AS ESTADO FROM ESTADOS_RECLAMOS');
    expect(filas.map((f) => f.ESTADO).sort()).toEqual([...ESTADOS_TICKET].sort());
  });

  it('estadoTarea cubre los estados en uso de ASIGNACION_JK3', async () => {
    const filas = await consultarDirecto<{ E: string }>('SELECT DISTINCT TRIM(ESTADO_ASIGNACION) AS E FROM ASIGNACION_JK3');
    for (const { E } of filas) expect(ESTADOS_TAREA).toContain(E);
  });

  it('prioridadTicket y sistema cubren los valores en uso de RECLAMOS', async () => {
    const prioridades = await consultarDirecto<{ P: string }>('SELECT DISTINCT TRIM(PRIORIDAD) AS P FROM RECLAMOS WHERE PRIORIDAD IS NOT NULL');
    for (const { P } of prioridades) expect(PRIORIDADES_TICKET).toContain(P);
    const sistemas = await consultarDirecto<{ S: string }>('SELECT DISTINCT TRIM(TIPO_SISTEMA) AS S FROM RECLAMOS WHERE TIPO_SISTEMA IS NOT NULL');
    for (const { S } of sistemas) expect(SISTEMAS).toContain(S);
  });
});

describe.skipIf(!hayAg)('obtener_contexto_ticket contra la base de desarrollo', () => {
  let acceso: AccesoDatos;
  afterAll(async () => acceso?.cerrar());

  it('#74836: structuredContent valida contra el outputSchema publicado', async () => {
    acceso = accesoDesdeEntorno();
    const { cliente, eventos } = await conectarCliente([crearObtenerContextoTicket({ acceso, zonaHoraria: ZONA })]);
    await cliente.listTools();
    const resultado = await cliente.callTool({ name: 'obtener_contexto_ticket', arguments: { ticketId: 74836 } });
    expect(resultado.isError).toBeFalsy();
    const datos = resultado.structuredContent as unknown as ContextoTicket;
    expect(datos.ticket.id).toBe(74836);
    expect(datos.ticket.creadoEn).toBe('2026-09-28T15:44:11.925-03:00');
    expect(datos.historial.length).toBeGreaterThanOrEqual(5);
    expect(datos.adjuntos.length).toBeGreaterThanOrEqual(2);
    expect(eventos.find((e) => e.evento === 'invocacion_tool')).toMatchObject({ llamadasBase: 6 });
  });
});

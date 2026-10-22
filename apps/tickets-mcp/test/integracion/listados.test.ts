import { afterAll, describe, expect, it } from 'vitest';
import type { AccesoDatos } from '../../src/db/firebird.js';
import { crearTools } from '../../src/tools/index.js';
import type { ListadoTareas } from '../../src/tools/listar-tareas.js';
import type { ListadoTickets } from '../../src/tools/listar-tickets.js';
import type { ResumenTickets } from '../../src/tools/resumir-tickets.js';
import { conectarCliente } from '../apoyo.js';
import { accesoDesdeEntorno, hayProcedimientosAg } from './base.js';

const hayAg = await hayProcedimientosAg();

describe.skipIf(!hayAg)('listados contra la base de desarrollo', { timeout: 120_000 }, () => {
  let acceso: AccesoDatos;
  afterAll(async () => acceso?.cerrar());

  async function llamar<T>(tool: string, args: Record<string, unknown>) {
    acceso ??= accesoDesdeEntorno();
    const { cliente, eventos } = await conectarCliente(crearTools({ acceso, zonaHoraria: 'America/Argentina/Buenos_Aires' }));
    await cliente.listTools();
    const resultado = await cliente.callTool({ name: tool, arguments: args });
    const detalle = eventos.find((e) => e.msg === 'Error inesperado en una tool') as { err?: { message?: string } } | undefined;
    expect(resultado.isError, `${JSON.stringify(resultado.structuredContent)} ${detalle?.err?.message ?? ''}`).toBeFalsy();
    const evento = eventos.find((e) => e.evento === 'invocacion_tool') as { duracionMs: number };
    return { datos: resultado.structuredContent as T, duracionMs: evento.duracionMs };
  }

  it('listar_tickets sin filtros: solo abiertos, ordenados por actualización, con total', async () => {
    const { datos, duracionMs } = await llamar<ListadoTickets>('listar_tickets', {});
    expect(datos.total).toBeGreaterThan(0);
    expect(datos.tickets.some((t) => ['FINALIZADO', 'CANCELADO'].includes(t.estado))).toBe(false);
    const fechas = datos.tickets.map((t) => Date.parse(t.actualizadoEn));
    expect([...fechas].sort((a, b) => b - a)).toEqual(fechas);
    console.info(`listar_tickets sin filtros: ${datos.total} abiertos en ${duracionMs} ms`);
  });

  it('mis tickets en septiembre incluyen el #74836, con su agenda y sin presupuesto', async () => {
    const { datos } = await llamar<ListadoTickets>('listar_tickets', {
      asignadoA: 15169,
      creadoDesde: '2026-09-01',
      creadoHasta: '2026-09-30',
      soloAbiertos: false,
      limite: 100,
    });
    const t = datos.tickets.find((x) => x.id === 74836);
    expect(t).toBeDefined();
    expect(t?.proximaAgenda).toEqual({ inicio: '2026-10-06T09:00:00-03:00', usuario: { id: 15169, nombre: 'Andres Pelaez' } });
    expect(t?.presupuesto).toBeNull();
    expect(datos.tickets.every((x) => x.asignadoA?.id === 15169 && x.creadoEn.startsWith('2026-09'))).toBe(true);
  });

  it('búsqueda por texto en título, sin acentos', async () => {
    const { datos, duracionMs } = await llamar<ListadoTickets>('listar_tickets', { texto: 'asiento', soloAbiertos: false, limite: 100 });
    expect(datos.tickets.map((t) => t.id)).toContain(74836);
    console.info(`listar_tickets texto=asiento: ${datos.total} en ${duracionMs} ms`);
  });

  it('búsqueda en mensajes (más lenta)', async () => {
    const { datos, duracionMs } = await llamar<ListadoTickets>('listar_tickets', {
      texto: 'adjujnto imagen',
      buscarEnMensajes: true,
      asignadoA: 15169,
      soloAbiertos: false,
    });
    expect(datos.tickets.map((t) => t.id)).toContain(74836);
    console.info(`listar_tickets buscarEnMensajes (asignado): ${duracionMs} ms`);
  });

  it('listar_tareas del #74703: 4 tareas de varios desarrolladores', async () => {
    const { datos } = await llamar<ListadoTareas>('listar_tareas', { ticketId: 74703, soloPendientes: false });
    expect(datos.total).toBe(4);
    expect(datos.tareas.every((t) => t.ticketId === 74703)).toBe(true);
    expect(datos.tareas.find((t) => t.id === 6248)?.desarrollador).toEqual({ id: 100936, nombre: 'Andres Pelaez' });
  });

  it('resumir_tickets: la suma de cada dimensión es igual al total', async () => {
    const { datos, duracionMs } = await llamar<ResumenTickets>('resumir_tickets', {
      agruparPor: ['estado', 'prioridad', 'sistema', 'cliente', 'asignado'],
    });
    const suma = (c: { cantidad: number }[] = []) => c.reduce((s, x) => s + x.cantidad, 0);
    for (const dim of [datos.porEstado, datos.porPrioridad, datos.porSistema, datos.porCliente, datos.porAsignado]) {
      expect(suma(dim)).toBe(datos.total);
    }
    expect(datos.porCliente!.length).toBeLessThanOrEqual(21);
    console.info(`resumir_tickets 5 dimensiones: ${datos.total} tickets en ${duracionMs} ms`);
  });
});

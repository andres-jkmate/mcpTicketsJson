import { describe, expect, it } from 'vitest';
import { accesoSimulado, conectarCliente } from '../../test/apoyo.js';
import { resumenSimulado, TICKETS, type TicketSimulado } from '../../test/datos/tickets-simulados.js';
import { conteosRef, crearResumirTickets, type ResumenTickets } from './resumir-tickets.js';

async function resumir(args: Record<string, unknown>, tickets: TicketSimulado[] = TICKETS) {
  const { acceso, llamadas } = accesoSimulado({ PROC_LIST_RESUMEN_TICKETS_AG: resumenSimulado(tickets) });
  const { cliente, eventos } = await conectarCliente([crearResumirTickets({ acceso, zonaHoraria: 'UTC' })]);
  await cliente.listTools();
  const resultado = await cliente.callTool({ name: 'resumir_tickets', arguments: args });
  const texto = (resultado.content as { text: string }[])[0]?.text ?? '';
  return { resultado, datos: resultado.structuredContent as unknown as ResumenTickets, llamadas, eventos, texto };
}

const suma = (c: { cantidad: number }[] = []) => c.reduce((s, x) => s + x.cantidad, 0);

describe('resumir_tickets', () => {
  it('conteo por estado', async () => {
    const base = TICKETS[3]!; // INICIADO
    const tickets = [
      ...[1, 2, 3].map((i) => ({ ...base, id: i, estado: 'INICIADO' })),
      ...[4, 5].map((i) => ({ ...base, id: i, estado: 'AGENDADO' })),
    ];
    const { datos } = await resumir({ agruparPor: ['estado'] }, tickets);
    expect(datos).toEqual({
      total: 5,
      porEstado: [
        { clave: 'INICIADO', cantidad: 3 },
        { clave: 'AGENDADO', cantidad: 2 },
      ],
    });
  });

  it('dimensiones por defecto: estado, prioridad y cliente; una llamada por dimensión', async () => {
    const { datos, llamadas, eventos } = await resumir({});
    expect(Object.keys(datos).sort()).toEqual(['porCliente', 'porEstado', 'porPrioridad', 'total']);
    expect(llamadas.map((l) => l.parametros[0])).toEqual(['ESTADO', 'PRIORIDAD', 'CLIENTE']);
    expect(eventos.find((e) => e.evento === 'invocacion_tool')).toMatchObject({ llamadasBase: 3 });
  });

  it('solo abiertos por defecto y los mismos filtros que listar_tickets', async () => {
    const { datos, llamadas } = await resumir({ agruparPor: ['estado'], asignadoA: 'yo' });
    expect(datos.total).toBe(2);
    expect(llamadas[0]?.parametros).toEqual(['ESTADO', null, 1, null, null, 15169, null, null, null, null, null, 0]);
  });

  it('suma de conteos igual al total en cualquier dimensión y combinación de filtros', async () => {
    for (const args of [{}, { soloAbiertos: false }, { asignadoA: 'yo' }, { texto: 'imagen', buscarEnMensajes: true }]) {
      const { datos } = await resumir({ ...args, agruparPor: ['estado', 'prioridad', 'sistema', 'cliente', 'asignado'] });
      for (const dim of [datos.porEstado, datos.porPrioridad, datos.porSistema, datos.porCliente, datos.porAsignado]) {
        expect(suma(dim)).toBe(datos.total);
      }
    }
  });

  it('top de clientes: 20 con nombre más una fila null con el resto', async () => {
    const tickets: TicketSimulado[] = Array.from({ length: 25 }, (_, i) =>
      Array.from({ length: 30 - i }, (_, j) => ({ ...TICKETS[3]!, id: i * 100 + j, cliente: [600000 + i, `Cliente ${i}`] as [number, string] })),
    ).flat();
    const { datos } = await resumir({ agruparPor: ['cliente'] }, tickets);
    expect(datos.porCliente).toHaveLength(21);
    expect(datos.porCliente?.[0]).toEqual({ clave: { id: 600000, nombre: 'Cliente 0' }, cantidad: 30 });
    expect(datos.porCliente?.[20]).toEqual({ clave: null, cantidad: 10 + 9 + 8 + 7 + 6 });
    expect(suma(datos.porCliente)).toBe(datos.total);
  });

  it('porAsignado: la fila null acumula además los tickets sin asignar', async () => {
    const { datos } = await resumir({ agruparPor: ['asignado'], soloAbiertos: false });
    expect(datos.porAsignado).toEqual([
      { clave: { id: 15169, nombre: 'Andres Pelaez' }, cantidad: 3 },
      { clave: { id: 15200, nombre: 'Carolina Guerra' }, cantidad: 1 },
      { clave: null, cantidad: 2 },
    ]);
  });

  it('tickets sin sistema', async () => {
    const { datos } = await resumir({ agruparPor: ['sistema'] });
    expect(datos.porSistema).toContainEqual({ clave: null, cantidad: 1 });
  });

  it('resumen en texto', async () => {
    const { texto } = await resumir({ asignadoA: 'yo', agruparPor: ['estado', 'prioridad'] });
    expect(texto).toBe('2 tickets abiertos. Por estado: AGENDADO 2. Por prioridad: ALTA 1, CRITICA 1.');
  });

  it('sin tickets: total 0 y dimensiones vacías', async () => {
    const { datos, resultado } = await resumir({ estados: ['A PRESUPUESTAR'], agruparPor: ['estado', 'cliente'] });
    expect(resultado.isError).toBeFalsy();
    expect(datos).toEqual({ total: 0, porEstado: [], porCliente: [] });
  });

  it('dimensión inválida o repetida → PARAMETRO_INVALIDO', async () => {
    for (const agruparPor of [['color'], ['estado', 'estado'], []]) {
      const { resultado } = await resumir({ agruparPor });
      expect(resultado.structuredContent).toMatchObject({ error: { codigo: 'PARAMETRO_INVALIDO' } });
    }
  });

  it('conteosRef no agrega la fila null si no hay resto', () => {
    expect(conteosRef([{ TOTAL: 1, CLAVE_ID: 1, CLAVE: 'A', CANTIDAD: 1 }])).toEqual([{ clave: { id: 1, nombre: 'A' }, cantidad: 1 }]);
  });
});

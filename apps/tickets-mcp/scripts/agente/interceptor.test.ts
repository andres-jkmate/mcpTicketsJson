import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { coincidencias, type ConsultasReferenciales, type Desarrollador } from './base.js';
import { cargarListasTools, leerJson, type ListasTools, type Version } from './configuracion.js';
import { cargarPlantillas, Interceptor, type ResultadoTool } from './interceptor.js';
import { cargarEscrituraV2, Validador } from './validacion.js';

const DESARROLLADORES: Desarrollador[] = [
  { id: 100934, nombre: 'GOVIEDO', alias: null, activo: true, nombresUsuario: ['GUSTAVO OVIEDO'] },
  { id: 1008413, nombre: 'LOVIEDO-FUTUROJK3', alias: null, activo: true, nombresUsuario: [] },
  { id: 100936, nombre: 'APELAEZ', alias: null, activo: true, nombresUsuario: ['Andres Pelaez'] },
];
const consultas: ConsultasReferenciales = {
  existeTicket: async (id) => [74836, 75056].includes(id),
  existeDesarrollador: async (id) => DESARROLLADORES.some((d) => d.id === id),
  buscarDesarrolladores: async (nombre) => coincidencias(DESARROLLADORES, nombre),
};

/** Servidor MCP simulado: responde lecturas y registra cualquier tool que reciba. */
async function servidorSimulado(listas: ListasTools, version: Version) {
  const recibidas: string[] = [];
  const server = new Server({ name: 'simulado', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    recibidas.push(req.params.name);
    return { content: [{ type: 'text', text: `lectura ${req.params.name}` }] };
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const cliente = new Client({ name: 'test', version: '1.0.0' });
  await cliente.connect(b);
  const escrituras = () => recibidas.filter((t) => !listas[version].lectura.includes(t));
  return { cliente, recibidas, escrituras, cerrar: () => cliente.close() };
}

const SCHEMA_V1_CREAR_TAREA = {
  type: 'object',
  properties: {
    NOMBRE: { type: 'string' },
    COD_DESARROLLADOR: { type: 'integer' },
    NRO_TICKET: { type: 'string' },
    DESCRIPCION: { type: 'string' },
  },
  required: ['NOMBRE', 'COD_DESARROLLADOR'],
};

let listas: ListasTools;
let schemasV2: Map<string, object>;
const validador = new Validador();
let servidor: Awaited<ReturnType<typeof servidorSimulado>> | undefined;

beforeAll(async () => {
  listas = cargarListasTools(await leerJson('tools.json'));
  schemasV2 = new Map(cargarEscrituraV2(await leerJson('escritura-v2.json')).map((t) => [t.name, t.input_schema]));
});

afterEach(async () => {
  // Ningún escenario puede hacer llegar una escritura al servidor.
  expect(servidor?.escrituras() ?? []).toEqual([]);
  await servidor?.cerrar();
  servidor = undefined;
});

async function interceptor(version: Version) {
  servidor = await servidorSimulado(listas, version);
  const cliente = servidor.cliente;
  const schemas = version === 'v1' ? new Map<string, object>([['crear_tarea', SCHEMA_V1_CREAR_TAREA]]) : schemasV2;
  return new Interceptor({
    version,
    listas,
    schemas,
    plantillas: await cargarPlantillas(version, [...listas[version].escritura]),
    consultas,
    validador,
    codDesarrollador: 100936,
    reenviar: async (tool, args) => (await cliente.callTool({ name: tool, arguments: args })) as ResultadoTool,
  });
}

const textoDe = (r: ResultadoTool) => r.content.map((c) => c.text ?? '').join('\n');

describe('interceptor', () => {
  it('reenvía las lecturas al servidor', async () => {
    const i = await interceptor('v1');
    const r = await i.ejecutar('detalle_ticket', { P_COD_RECLAMO: 74836 });
    expect(r.interceptada).toBe(false);
    expect(textoDe(r.resultado)).toBe('lectura detalle_ticket');
    expect(servidor!.recibidas).toEqual(['detalle_ticket']);
  });

  it('crear_tarea en v1: no llega al servidor, responde con la plantilla y registra los argumentos', async () => {
    const i = await interceptor('v1');
    const args = { NOMBRE: 'Revisar error', COD_DESARROLLADOR: 100934, NRO_TICKET: '74836', DESCRIPCION: 'Criterios: ...' };
    const r = await i.ejecutar('crear_tarea', args);
    expect(r.interceptada).toBe(true);
    expect(r.errorParametro).toBe(false);
    expect(JSON.parse(textoDe(r.resultado))).toEqual({ resultado: [{ RESULTADO: 1, MENSAJE: '' }] });
    expect(i.escrituras).toEqual([expect.objectContaining({ tool: 'crear_tarea', argumentos: args, valida: true })]);
    expect(servidor!.recibidas).toEqual([]);
  });

  it('agregar_mensaje_ticket en v1: ids ficticios crecientes', async () => {
    const i = await interceptor('v1');
    const a = await i.ejecutar('agregar_mensaje_ticket', { P_COD_RECLAMO: 75056, P_MENSAJE: 'x' });
    const b = await i.ejecutar('agregar_mensaje_ticket', { P_COD_RECLAMO: 75056, P_MENSAJE: 'y' });
    const id = (r: ResultadoTool) => (JSON.parse(textoDe(r)) as { resultado: { COD_MENSAJE_CLIENTE: number }[] }).resultado[0]!.COD_MENSAJE_CLIENTE;
    expect(id(b.resultado)).toBe(id(a.resultado) + 1);
  });

  it('objeto compuesto inválido en v2: error que nombra el campo faltante y cuenta como error de parámetro', async () => {
    const i = await interceptor('v2');
    const r = await i.ejecutar('crear_tarea', {
      tarea: { nombre: 'x' },
      asignacion: { desarrollador: { id: 100934 } },
      descripcion: { pedido: 'x' },
    });
    expect(r.resultado.isError).toBe(true);
    expect(r.errorParametro).toBe(true);
    expect(textoDe(r.resultado)).toContain('descripcion.criteriosAceptacion');
  });

  it('v2 con personaRef { nombre } único: válido y resuelto; respuesta con el contrato de la v2', async () => {
    const i = await interceptor('v2');
    const r = await i.ejecutar('crear_tarea', {
      tarea: { nombre: 'Revisar error' },
      asignacion: { desarrollador: { nombre: 'Gustavo Oviedo' }, responsable: 'yo' },
      ticketId: 74836,
      descripcion: { pedido: 'x', criteriosAceptacion: ['a'] },
    });
    expect(r.errorParametro).toBe(false);
    expect(i.escrituras[0]!.resueltos).toEqual({ 'asignacion.desarrollador': 100934, 'asignacion.responsable': 100936 });
    expect(r.resultado.content).toHaveLength(2);
    expect(r.resultado.structuredContent).toEqual({ id: 900_001, estado: 'POR INICIAR', ticketId: 74836 });
  });

  it('v2 con personaRef { nombre } ambiguo o inexistente: PARAMETRO_INVALIDO con candidatos o NO_ENCONTRADO', async () => {
    const i = await interceptor('v2');
    const base = { tarea: { nombre: 'x' }, descripcion: { pedido: 'x', criteriosAceptacion: ['a'] } };
    const ambiguo = await i.ejecutar('crear_tarea', { ...base, asignacion: { desarrollador: { nombre: 'Oviedo' } } });
    expect(textoDe(ambiguo.resultado)).toMatch(/PARAMETRO_INVALIDO.*[\s\S]*candidatos/);
    const nadie = await i.ejecutar('crear_tarea', { ...base, asignacion: { desarrollador: { nombre: 'Nadie' } } });
    expect(textoDe(nadie.resultado)).toMatch(/NO_ENCONTRADO/);
    expect(ambiguo.errorParametro && nadie.errorParametro).toBe(true);
  });

  it.each<[Version, string, Record<string, unknown>]>([
    ['v1', 'agregar_mensaje_ticket', { P_COD_RECLAMO: 1, P_MENSAJE: 'x' }],
    ['v2', 'actualizar_ticket', { ticketId: 1, mensaje: { texto: 'x' } }],
  ])('%s: ticket inexistente → error referencial igual en las dos versiones', async (version, tool, args) => {
    const i = await interceptor(version);
    const r = await i.ejecutar(tool, args);
    expect(r.resultado.isError).toBe(true);
    expect(textoDe(r.resultado)).toContain('El ticket 1 no existe');
  });

  it('v1: desarrollador inexistente → error referencial', async () => {
    const i = await interceptor('v1');
    const r = await i.ejecutar('crear_tarea', { NOMBRE: 'x', COD_DESARROLLADOR: 42 });
    expect(textoDe(r.resultado)).toContain('El desarrollador 42 no existe');
  });

  it('una tool que no está en ninguna lista se intercepta (plantilla genérica)', async () => {
    const i = await interceptor('v1');
    const r = await i.ejecutar('tool_nueva_de_la_v1', { X: 1 });
    expect(r.interceptada).toBe(true);
    expect(i.escrituras[0]!.plantillaGenerica).toBe(true);
    expect(servidor!.recibidas).toEqual([]);
  });
});

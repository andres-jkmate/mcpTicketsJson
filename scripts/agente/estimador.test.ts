import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { coincidencias, type ConsultasReferenciales, type Desarrollador } from './base.js';
import { cargarListasTools, leerJson, type ListasTools } from './configuracion.js';
import { simularGuion, tokensConversacion, type ConversacionMedida } from './estimador.js';
import type { Guion, SupuestosEstimacion } from './guiones.js';
import { aToolsModelo } from './herramientas.js';
import { cargarPlantillas, Interceptor, type ResultadoTool } from './interceptor.js';
import { cargarEscrituraV2, Validador, type ToolEscrituraV2 } from './validacion.js';

const DESARROLLADORES: Desarrollador[] = [
  { id: 100934, nombre: 'GOVIEDO', alias: null, activo: true, nombresUsuario: ['GUSTAVO OVIEDO'] },
  { id: 100936, nombre: 'APELAEZ', alias: null, activo: true, nombresUsuario: ['Andres Pelaez'] },
];
const consultas: ConsultasReferenciales = {
  existeTicket: async (id) => [74836, 75056].includes(id),
  existeDesarrollador: async (id) => DESARROLLADORES.some((d) => d.id === id),
  buscarDesarrolladores: async (nombre) => coincidencias(DESARROLLADORES, nombre),
};

const SUPUESTOS: SupuestosEstimacion = { razonCaracteresPorToken: 3.5, thinkingPorTurno: 300, respuestaFinal: 400, promptToolUse: 346 };
const SIN_FIJOS: SupuestosEstimacion = { ...SUPUESTOS, thinkingPorTurno: 0, respuestaFinal: 0, promptToolUse: 0 };

let listas: ListasTools;
let escrituraV2: ToolEscrituraV2[];
let servidor: { recibidas: string[]; cerrar: () => Promise<void> } | undefined;

beforeAll(async () => {
  listas = cargarListasTools(await leerJson('tools.json'));
  escrituraV2 = cargarEscrituraV2(await leerJson('escritura-v2.json'));
});

afterEach(async () => {
  // Ninguna escritura del guion puede llegar al servidor.
  expect(servidor?.recibidas.filter((t) => !listas.v2.lectura.includes(t)) ?? []).toEqual([]);
  await servidor?.cerrar();
  servidor = undefined;
});

/** Servidor v2 simulado: cada lectura responde un texto de largo fijo. */
async function simulacion(guion: Guion, largoRespuesta = 700) {
  const recibidas: string[] = [];
  const server = new Server({ name: 'simulado', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    recibidas.push(req.params.name);
    return { content: [{ type: 'text', text: 'r'.repeat(largoRespuesta) }] };
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const cliente = new Client({ name: 'test', version: '1.0.0' });
  await cliente.connect(b);
  servidor = { recibidas, cerrar: () => cliente.close() };

  const publicadas = listas.v2.lectura.map((name) => ({ name, description: `Tool ${name}`, inputSchema: { type: 'object' as const } }));
  const tools = aToolsModelo(publicadas, escrituraV2);
  const interceptor = new Interceptor({
    version: 'v2',
    listas,
    schemas: new Map(tools.map((t) => [t.name, t.input_schema as object])),
    plantillas: await cargarPlantillas('v2', [...listas.v2.escritura]),
    consultas,
    validador: new Validador(),
    codDesarrollador: 100936,
    reenviar: async (tool, args) => (await cliente.callTool({ name: tool, arguments: args })) as ResultadoTool,
  });
  return simularGuion({ guion, tools, system: 'Sistema de prueba.', pedido: 'Pedido de prueba', hoy: '2026-10-20', ejecutarTool: (t, x) => interceptor.ejecutar(t, x) });
}

const CREAR_TAREA = {
  tool: 'crear_tarea',
  argumentos: {
    tarea: { nombre: 'Revisar error' },
    asignacion: { desarrollador: { nombre: 'Gustavo Oviedo' } },
    ticketId: 74836,
    descripcion: { pedido: 'Revisar el error', criteriosAceptacion: ['No se reproduce'] },
  },
};
const GUION: Guion = [
  [{ tool: 'obtener_contexto_ticket', argumentos: { ticketId: 74836 } }],
  [
    { tool: 'listar_tareas', argumentos: { limite: 20 } },
    { tool: 'listar_tickets', argumentos: { asignadoA: 'yo' } },
  ],
  [CREAR_TAREA],
];

describe('simulador (D12)', () => {
  let m: ConversacionMedida;
  beforeAll(async () => {
    m = await simulacion(GUION);
    await servidor?.cerrar();
    servidor = undefined;
  });

  it('mide un turno por request, con el de la respuesta final al último', () => {
    expect(m.turnos.map((t) => t.llamadas.map((l) => l.tool))).toEqual([['obtener_contexto_ticket'], ['listar_tareas', 'listar_tickets'], ['crear_tarea'], []]);
    expect(m.turnos[0]!.llamadas[0]).toMatchObject({ interceptada: false, caracteresResultado: 700 });
    expect(m.turnos[2]!.llamadas[0]).toMatchObject({ interceptada: true, error: false });
    expect(m.cantidadTools).toBe(6);
  });

  it('el historial crece turno a turno', () => {
    const entradas = tokensConversacion(m, SUPUESTOS, 3.5).sinCache.map((t) => t.input_tokens);
    for (let i = 1; i < entradas.length; i++) expect(entradas[i]!).toBeGreaterThan(entradas[i - 1]!);
    // Del turno 1 al 2 entran los argumentos y los 700 caracteres de la respuesta.
    expect(entradas[1]! - entradas[0]!).toBeCloseTo((m.turnos[0]!.llamadas[0]!.caracteresArgumentos + 700) / 3.5);
  });

  it('en sesión caliente, la lectura de caché de un turno es igual al request anterior completo', () => {
    const t = tokensConversacion(m, SUPUESTOS, 3.5).sesionCaliente;
    const total = (x: (typeof t)[number]) => x.input_tokens + x.cache_read_input_tokens + x.cache_creation_input_tokens;
    expect(t[0]!.input_tokens).toBeCloseTo('Pedido de prueba'.length / 3.5);
    expect(t[0]!.cache_creation_input_tokens).toBe(0);
    for (let i = 1; i < t.length; i++) {
      expect(t[i]!.cache_read_input_tokens).toBeCloseTo(total(t[i - 1]!));
      expect(t[i]!.input_tokens).toBe(0);
    }
    // Sin caché, la entrada de cada turno es la misma, toda sin caché.
    const sin = tokensConversacion(m, SUPUESTOS, 3.5).sinCache;
    t.forEach((x, i) => expect(total(x)).toBeCloseTo(sin[i]!.input_tokens));
  });

  it('la salida suma argumentos, thinking por turno y la respuesta final en el último turno', () => {
    const salida = tokensConversacion(m, SUPUESTOS, 3.5).sinCache.map((t) => t.output_tokens);
    expect(salida[0]).toBeCloseTo(m.turnos[0]!.llamadas[0]!.caracteresArgumentos / 3.5 + 300);
    expect(salida.at(-1)).toBe(300 + 400);
  });

  it('cambiar la razón cambia los tokens en proporción', () => {
    const a = tokensConversacion(m, SIN_FIJOS, 3);
    const b = tokensConversacion(m, SIN_FIJOS, 4);
    for (const escenario of ['sesionCaliente', 'sinCache'] as const) {
      a[escenario].forEach((t, i) => {
        const u = b[escenario][i]!;
        for (const k of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'] as const) expect(u[k] * 4).toBeCloseTo(t[k] * 3);
      });
    }
  });

  it('una escritura del guion que no valida es un error del guion', async () => {
    const invalida = { ...CREAR_TAREA, argumentos: { ...CREAR_TAREA.argumentos, descripcion: { pedido: 'x' } } };
    await expect(simulacion([[invalida]])).rejects.toThrow(/la escritura crear_tarea no valida.*criteriosAceptacion/);
  });

  it('una tool que el modelo no recibe es un error del guion', async () => {
    await expect(simulacion([[{ tool: 'detalle_ticket', argumentos: {} }]])).rejects.toThrow(/no recibe la tool detalle_ticket/);
  });
});

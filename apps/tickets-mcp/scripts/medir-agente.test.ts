import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { afterAll, describe, expect, it } from 'vitest';
import type { VerdadReferencia } from './agente/base.js';
import type { Caso } from './agente/casos.js';
import type { ClienteModelo } from './agente/loop.js';
import { Registro, type LineaRegistro } from './agente/registro.js';
import { ejecutarMedicion, generarReporte, leerArgumentos, planificar } from './medir-agente.js';

let carpeta: string | undefined;
afterAll(async () => carpeta && rm(carpeta, { recursive: true, force: true }));

describe('argumentos', () => {
  it('valores por defecto y listas', () => {
    expect(leerArgumentos([])).toEqual({ repeticiones: undefined, casos: undefined, versiones: ['v1', 'v2'], topeUsd: null, soloReporte: null });
    expect(leerArgumentos(['--repeticiones', '1', '--casos', 'estado-ticket,crear-tarea', '--versiones', 'v2', '--tope-usd', '2.5'])).toMatchObject({
      repeticiones: 1, casos: ['estado-ticket', 'crear-tarea'], versiones: ['v2'], topeUsd: 2.5,
    });
    expect(leerArgumentos(['--solo-reporte']).soloReporte).toBe(true);
    expect(leerArgumentos(['--solo-reporte', 'x.jsonl']).soloReporte).toBe('x.jsonl');
  });

  it('rechaza casos, versiones o números inválidos', () => {
    expect(() => leerArgumentos(['--casos', 'otro'])).toThrow(/--casos/);
    expect(() => leerArgumentos(['--versiones', 'v3'])).toThrow(/--versiones/);
    expect(() => leerArgumentos(['--repeticiones', '0'])).toThrow(/--repeticiones/);
  });
});

describe('planificador (D9)', () => {
  it('intercala casos y versiones y alterna qué versión va primero en cada repetición', () => {
    const plan = planificar(['estado-ticket', 'crear-tarea'], ['v1', 'v2'], 2).map((p) => `${p.repeticion}:${p.caso}:${p.version}`);
    expect(plan).toEqual([
      '1:estado-ticket:v1', '1:estado-ticket:v2', '1:crear-tarea:v1', '1:crear-tarea:v2',
      '2:estado-ticket:v2', '2:estado-ticket:v1', '2:crear-tarea:v2', '2:crear-tarea:v1',
    ]);
  });

  it('con 1 repetición y los 5 casos hay 10 corridas', () => {
    const casos = ['estado-ticket', 'mis-tickets-agendados', 'mis-tareas-pendientes', 'crear-tarea', 'prioridad-mensaje'] as const;
    expect(planificar([...casos], ['v1', 'v2'], 1)).toHaveLength(10);
  });
});

const CASO: Caso = { id: 'estado-ticket', tipo: 'lectura', ticketId: 74836, pedido: 'p', criterio: 'c' };
const REF: VerdadReferencia = { codUsuario: 1, codDesarrollador: 2, 'estado-ticket': { ticketId: 74836, estado: 'AGENDADO', resultado: '', tareasAbiertas: [] } };
const PRECIO = { entrada: 4, salida: 20, lecturaCache: 0.2, escrituraCache: 5 };

/** Cada request cuesta US$ 1 (250.000 tokens de entrada) y pide una tool. */
function clienteCaro() {
  let requests = 0;
  const cliente: ClienteModelo = {
    messages: {
      stream: () => {
        requests++;
        return {
          finalMessage: async () =>
            ({
              content: [{ type: 'tool_use', id: `t${requests}`, name: 'detalle_ticket', input: {} }],
              stop_reason: 'tool_use',
              usage: { input_tokens: 250_000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
            }) as unknown as Anthropic.Message,
        };
      },
    },
  };
  return { cliente, requests: () => requests };
}

describe('corte por tope de costo', () => {
  it('con tope de US$ 2 no envía más requests al superarlo y lo indica', async () => {
    const { cliente, requests } = clienteCaro();
    const lineas: LineaRegistro[] = [];
    const r = await ejecutarMedicion({
      cliente,
      precio: PRECIO,
      topeUsd: 2,
      plan: planificar(['estado-ticket'], ['v1', 'v2'], 3),
      casos: [CASO],
      tools: { v1: [], v2: [] },
      crearInterceptor: () => ({ ejecutar: async () => ({ resultado: { content: [{ type: 'text', text: 'r' }] }, interceptada: false, errorParametro: false }) }),
      referencia: REF,
      system: 's',
      maxTurnos: 25,
      escribir: async (l) => void lineas.push(l),
    });
    expect(r.cortadaPorTope).toBe(true);
    expect(requests()).toBe(2);
    expect(r.costoUsd).toBeCloseTo(2);
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatchObject({ tipo: 'corrida', resultado: { fin: 'tope_costo' }, verificacion: { exito: false } });
  });
});

describe('--solo-reporte', () => {
  it('regenera el reporte desde el registro y refleja un cambio de precio', async () => {
    carpeta = await mkdtemp(join(tmpdir(), 'medir-agente-'));
    const registro = new Registro(join(carpeta, '2026-10-20-1200.jsonl'));
    await registro.escribir({ tipo: 'ejecucion', id: '2026-10-20-1200', fecha: '', modelo: 'claude-opus-5-5', effort: 'medium', maxTokens: 16000, repeticiones: 1, casos: ['estado-ticket'], versiones: ['v1'], topeUsd: null, tools: {} });
    await registro.escribir({
      tipo: 'corrida', caso: 'estado-ticket', version: 'v1', repeticion: 1, orden: 1, modelo: 'claude-opus-5-5', effort: 'medium', system: 's', pedido: 'p',
      resultado: {
        turnos: [{ turno: 1, usage: { input_tokens: 1_000_000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, duracionMs: 1, stopReason: 'end_turn', toolsPedidas: [], tools: [], duracionToolsMs: 0 }],
        fin: 'end_turn', respuestaFinal: 'r', tiempoTotalMs: 2, tiempoModeloMs: 1, tiempoToolsMs: 0, erroresTool: 0, erroresParametro: 0, escrituras: [],
      },
      verificacion: { exito: true },
    });
    const costo = async (entrada: number) => {
      await generarReporte(registro.archivo, { modelos: { 'claude-opus-5-5': { ...PRECIO, entrada } } }, carpeta);
      return (JSON.parse(await readFile(join(carpeta!, '2026-10-20-1200.json'), 'utf8')) as { totales: { v1: { costoTotalUsd: number } } }).totales.v1.costoTotalUsd;
    };
    expect(await costo(4)).toBeCloseTo(4);
    expect(await costo(5)).toBeCloseTo(5);
  });
});

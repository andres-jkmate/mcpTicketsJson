import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import type { EjecucionTool } from './interceptor.js';
import { correrAgente, MAX_TOKENS, MODELO, promptSistema, type ClienteModelo, type OpcionesLoop } from './loop.js';

const USO = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 10 };

function mensaje(stop: Anthropic.StopReason, content: unknown[], extra: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return { id: 'm', type: 'message', role: 'assistant', model: MODELO, content, stop_reason: stop, stop_details: null, usage: USO, ...extra } as unknown as Anthropic.Message;
}
const toolUse = (id: string, name: string, input: unknown = {}) => ({ type: 'tool_use', id, name, input });
const texto = (t: string) => ({ type: 'text', text: t });

/** Cliente de Anthropic simulado: responde con los mensajes del guion y guarda cada request. */
function clienteSimulado(guion: Anthropic.Message[]) {
  const requests: Anthropic.MessageStreamParams[] = [];
  const cliente: ClienteModelo = {
    messages: {
      stream(params) {
        requests.push(structuredClone(params));
        const siguiente = guion.shift();
        return { finalMessage: async () => (siguiente ? siguiente : Promise.reject(new Error('guion agotado'))) };
      },
    },
  };
  return { cliente, requests };
}

const ok = (texto: string): EjecucionTool => ({ resultado: { content: [{ type: 'text', text: texto }] }, interceptada: false, errorParametro: false });

function opciones(cliente: ClienteModelo, extra: Partial<OpcionesLoop> = {}): OpcionesLoop {
  return {
    cliente,
    system: promptSistema('2026-10-20'),
    tools: [{ name: 'detalle_ticket', description: 'd', input_schema: { type: 'object' } }],
    pedido: '¿Cómo está el 74836?',
    maxTurnos: 25,
    ejecutarTool: async (nombre) => ok(`resultado de ${nombre}`),
    ...extra,
  };
}

describe('loop de agente', () => {
  it('dos turnos con tool: historial solo agregado y parámetros fijos', async () => {
    const { cliente, requests } = clienteSimulado([
      mensaje('tool_use', [{ type: 'thinking', thinking: '', signature: 's' }, toolUse('t1', 'detalle_ticket', { P_COD_RECLAMO: 74836 })]),
      mensaje('end_turn', [texto('Está AGENDADO.')]),
    ]);
    const r = await correrAgente(opciones(cliente));
    expect(r.fin).toBe('end_turn');
    expect(r.respuestaFinal).toBe('Está AGENDADO.');
    expect(r.turnos).toHaveLength(2);
    const [primero, segundo] = requests as [Anthropic.MessageStreamParams, Anthropic.MessageStreamParams];
    expect(segundo.messages.slice(0, primero.messages.length)).toEqual(primero.messages); // solo se agrega
    expect(segundo.messages[1]).toEqual({ role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 's' }, toolUse('t1', 'detalle_ticket', { P_COD_RECLAMO: 74836 })] });
    expect(segundo.messages[2]).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'resultado de detalle_ticket' }] });
    for (const req of requests) {
      expect(req).toMatchObject({ model: MODELO, max_tokens: MAX_TOKENS, output_config: { effort: 'medium' }, cache_control: { type: 'ephemeral' } });
      expect(req).not.toHaveProperty('thinking');
      expect(req).not.toHaveProperty('fallbacks');
    }
  });

  it('tools paralelas: se devuelven todas en un único mensaje', async () => {
    const { cliente, requests } = clienteSimulado([
      mensaje('tool_use', [toolUse('a', 'historial_ticket'), toolUse('b', 'agendas_ticket')]),
      mensaje('end_turn', [texto('listo')]),
    ]);
    const r = await correrAgente(opciones(cliente));
    const resultados = requests[1]!.messages[2]!.content as Anthropic.ToolResultBlockParam[];
    expect(resultados.map((x) => x.tool_use_id).sort()).toEqual(['a', 'b']);
    expect(requests[1]!.messages).toHaveLength(3);
    expect(r.turnos[0]!.tools).toHaveLength(2);
  });

  it('un error de tool no corta la corrida y se cuenta', async () => {
    const { cliente, requests } = clienteSimulado([
      mensaje('tool_use', [toolUse('a', 'crear_tarea'), toolUse('b', 'detalle_ticket')]),
      mensaje('end_turn', [texto('no pude')]),
    ]);
    const r = await correrAgente(
      opciones(cliente, {
        ejecutarTool: async (nombre) =>
          nombre === 'crear_tarea'
            ? { resultado: { isError: true, content: [{ type: 'text', text: 'PARAMETRO_INVALIDO' }] }, interceptada: true, errorParametro: true }
            : Promise.reject(new Error('socket cerrado')),
      }),
    );
    expect(r.fin).toBe('end_turn');
    expect(r.erroresTool).toBe(2);
    expect(r.erroresParametro).toBe(1);
    const resultados = requests[1]!.messages[2]!.content as Anthropic.ToolResultBlockParam[];
    expect(resultados.every((x) => x.is_error)).toBe(true);
  });

  it('un rechazo del modelo marca la corrida como fallida con el motivo', async () => {
    const { cliente } = clienteSimulado([
      mensaje('refusal', [], { stop_details: { type: 'refusal', category: 'cyber', explanation: 'x' } } as Partial<Anthropic.Message>),
    ]);
    const r = await correrAgente(opciones(cliente));
    expect(r.fin).toBe('refusal');
    expect(r.motivo).toContain('cyber');
    expect(r.respuestaFinal).toBeNull();
  });

  it('corta por límite de turnos sin enviar más requests', async () => {
    const { cliente, requests } = clienteSimulado([1, 2, 3].map((i) => mensaje('tool_use', [toolUse(`t${i}`, 'detalle_ticket')])));
    const r = await correrAgente(opciones(cliente, { maxTurnos: 2 }));
    expect(r.fin).toBe('max_turnos');
    expect(requests).toHaveLength(2);
  });

  it('corta por tope de costo antes del siguiente request', async () => {
    const { cliente, requests } = clienteSimulado([mensaje('tool_use', [toolUse('t', 'detalle_ticket')]), mensaje('end_turn', [texto('x')])]);
    let costo = 0;
    const r = await correrAgente(opciones(cliente, { puedeSeguir: () => costo < 1, alTerminarTurno: () => (costo += 1) }));
    expect(r.fin).toBe('tope_costo');
    expect(requests).toHaveLength(1);
  });

  it('registro: tiempo del modelo + tiempo de tools ≤ total, y todos los campos de usage', async () => {
    let ahora = 0;
    const reloj = () => (ahora += 7);
    const { cliente } = clienteSimulado([mensaje('tool_use', [toolUse('a', 'x'), toolUse('b', 'y')]), mensaje('end_turn', [texto('fin')])]);
    const r = await correrAgente(opciones(cliente, { reloj }));
    expect(r.tiempoModeloMs + r.tiempoToolsMs).toBeLessThanOrEqual(r.tiempoTotalMs);
    expect(r.tiempoModeloMs).toBeGreaterThan(0);
    expect(r.tiempoToolsMs).toBeGreaterThan(0);
    for (const t of r.turnos) expect(Object.keys(t.usage).sort()).toEqual(['cache_creation_input_tokens', 'cache_read_input_tokens', 'input_tokens', 'output_tokens']);
  });

  it('el prompt de sistema no menciona tools y termina con la fecha del día', () => {
    const p = promptSistema('2026-10-20');
    expect(p).not.toMatch(/listar_|obtener_|crear_tarea|detalle_ticket/);
    expect(p.endsWith('Fecha de hoy: 2026-10-20.')).toBe(true);
  });
});

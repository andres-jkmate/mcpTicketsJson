import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { afterAll, describe, expect, it } from 'vitest';
import { correrAgente, EFFORT, MAX_TOKENS, MODELO, promptSistema, type ClienteModelo } from './loop.js';
import { leerRegistro, Registro } from './registro.js';

let carpeta: string | undefined;
afterAll(async () => carpeta && rm(carpeta, { recursive: true, force: true }));

const uso = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3, cache_creation_input_tokens: 2 };
const guion = [
  { content: [{ type: 'tool_use', id: 't', name: 'x', input: {} }], stop_reason: 'tool_use', usage: uso },
  { content: [{ type: 'text', text: 'fin' }], stop_reason: 'end_turn', usage: uso },
] as unknown as Anthropic.Message[];

describe('registro .jsonl', () => {
  it('guarda la ejecución y la corrida con turnos, usage y tiempos, y se puede volver a leer', async () => {
    carpeta = await mkdtemp(join(tmpdir(), 'registro-'));
    const registro = new Registro(join(carpeta, 'prueba.jsonl'));
    const cliente: ClienteModelo = { messages: { stream: () => ({ finalMessage: async () => guion.shift()! }) } };
    const resultado = await correrAgente({
      cliente,
      system: promptSistema('2026-10-20'),
      tools: [],
      pedido: 'p',
      maxTurnos: 5,
      ejecutarTool: async () => ({ resultado: { content: [{ type: 'text', text: 'r' }] }, interceptada: false, errorParametro: false }),
    });
    await registro.escribir({
      tipo: 'ejecucion', id: 'prueba', fecha: '2026-10-20T00:00:00Z', modelo: MODELO, effort: EFFORT, maxTokens: MAX_TOKENS,
      repeticiones: 1, casos: ['estado-ticket'], versiones: ['v1'], topeUsd: null, tools: {},
    });
    await registro.escribir({
      tipo: 'corrida', caso: 'estado-ticket', version: 'v1', repeticion: 1, orden: 1, modelo: MODELO, effort: EFFORT,
      system: promptSistema('2026-10-20'), pedido: 'p', resultado, verificacion: { exito: true },
    });
    await registro.escribir({ tipo: 'fin', fecha: '2026-10-20T00:00:01Z', cortadaPorTope: false });

    const leido = await leerRegistro(registro.archivo);
    const corrida = leido.corridas[0]!;
    expect(leido.ejecucion.modelo).toBe(MODELO);
    expect(leido.fin?.cortadaPorTope).toBe(false);
    expect(corrida.resultado.turnos).toHaveLength(2);
    expect(corrida.resultado.turnos[0]!.usage).toEqual(uso);
    expect(corrida.resultado.turnos[0]!.tools[0]).toMatchObject({ nombre: 'x', interceptada: false, error: false });
    const r = corrida.resultado;
    expect(r.tiempoModeloMs + r.tiempoToolsMs).toBeLessThanOrEqual(r.tiempoTotalMs);
  });
});

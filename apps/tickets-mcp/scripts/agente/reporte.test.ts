import { describe, expect, it } from 'vitest';
import type { Version } from './configuracion.js';
import type { ResultadoCorrida } from './loop.js';
import type { LineaCorrida, RegistrosLeidos } from './registro.js';
import { aMarkdown, armarReporte, costoUso, rango, SIN_EXITOS } from './reporte.js';

const PRECIOS = { modelos: { 'claude-opus-5-5': { entrada: 4, salida: 20, lecturaCache: 0.2, escrituraCache: 5 } } };
const TEXTO_TICKET = 'no puedo cargar e3l asiento';
const RESPUESTA = 'El ticket está AGENDADO y falta la tarea 6210';

function corrida(version: Version, exito: boolean, salida: number, tiempo: number, caso: LineaCorrida['caso'] = 'estado-ticket'): LineaCorrida {
  const resultado: ResultadoCorrida = {
    turnos: [{ turno: 1, usage: { input_tokens: 1000, output_tokens: salida, cache_read_input_tokens: 10_000, cache_creation_input_tokens: 2000 }, duracionMs: tiempo - 100, stopReason: 'end_turn', toolsPedidas: [], tools: [], duracionToolsMs: 0 }],
    fin: 'end_turn',
    respuestaFinal: RESPUESTA,
    tiempoTotalMs: tiempo,
    tiempoModeloMs: tiempo - 100,
    tiempoToolsMs: 50,
    erroresTool: exito ? 0 : 1,
    erroresParametro: 0,
    escrituras: [{ tool: 'crear_tarea', argumentos: { DESCRIPCION: TEXTO_TICKET }, valida: true, errores: [], resueltos: {}, plantillaGenerica: false }],
  };
  return { tipo: 'corrida', caso, version, repeticion: 1, orden: 1, modelo: 'claude-opus-5-5', effort: 'medium', system: 'PROMPT-SISTEMA-PRUEBA', pedido: TEXTO_TICKET, resultado, verificacion: { exito, ...(exito ? {} : { motivo: 'faltan datos esperados' }) } };
}

const registros = (): RegistrosLeidos => ({
  ejecucion: {
    tipo: 'ejecucion', id: '2026-10-20-1200', fecha: '2026-10-20T15:00:00Z', modelo: 'claude-opus-5-5', effort: 'medium', maxTokens: 16000,
    repeticiones: 3, casos: ['estado-ticket', 'mis-tickets-agendados'], versiones: ['v1', 'v2'], topeUsd: 5,
    tools: { v1: { cantidad: 24, caracteres: 22582, tokens: 6000 }, v2: { cantidad: 6, caracteres: 14337, tokens: 3500 } },
  },
  corridas: [
    corrida('v1', true, 500, 10_000), corrida('v1', false, 700, 12_000), corrida('v1', true, 600, 11_000),
    corrida('v2', true, 300, 6000), corrida('v2', true, 400, 7000), corrida('v2', true, 350, 8000),
    corrida('v1', false, 100, 1000, 'mis-tickets-agendados'), corrida('v2', true, 100, 1000, 'mis-tickets-agendados'),
  ],
  fin: { tipo: 'fin', fecha: '2026-10-20T15:10:00Z', cortadaPorTope: false },
});

describe('costo', () => {
  it('multiplica cada tipo de token por su precio', () => {
    const u = { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 };
    expect(costoUso(u, PRECIOS.modelos['claude-opus-5-5'])).toBeCloseTo(29.2);
  });

  it('mediana, mínimo y máximo', () => {
    expect(rango([3, 1, 2])).toEqual({ mediana: 2, min: 1, max: 3 });
    expect(rango([4, 1, 2, 3])).toEqual({ mediana: 2.5, min: 1, max: 4 });
    expect(rango([])).toBeNull();
  });
});

describe('reporte', () => {
  it('estadísticas por caso y versión, costo por tarea bien resuelta y diferencia v1 → v2', () => {
    const r = armarReporte(registros(), PRECIOS, new Date('2026-10-20T15:10:00Z'));
    const caso = r.casos[0]!;
    expect(caso.v1!.exitosas).toBe(2);
    expect(caso.v1!.costoPorTareaBienResuelta).toBeCloseTo(caso.v1!.costoTotalUsd / 2);
    expect(caso.v1!.metricas.tiempoTotalMs).toEqual({ mediana: 11_000, min: 10_000, max: 12_000 });
    expect(caso.diferencia.tiempoMedianoPct).toBeCloseTo(-36.4);
    expect(caso.diferencia.tasaExitoPp).toBeCloseTo(33.3);
    expect(r.totales.v1!.corridas).toBe(4);
  });

  it('un caso sin éxitos informa "sin éxitos", no cero ni infinito', () => {
    const r = armarReporte(registros(), PRECIOS, new Date());
    expect(r.casos[1]!.v1!.costoPorTareaBienResuelta).toBe(SIN_EXITOS);
    expect(r.casos[1]!.diferencia.costoPorTareaBienResueltaPct).toBeNull();
    expect(aMarkdown(r)).toContain(`| **Costo por tarea bien resuelta** | ${SIN_EXITOS} |`);
  });

  it('el Markdown tiene una tabla por caso y el total, con modelo, effort y tamaños de tools', () => {
    const md = aMarkdown(armarReporte(registros(), PRECIOS, new Date()));
    expect(md).toContain('## estado-ticket');
    expect(md).toContain('## Total');
    expect(md).toContain('`claude-opus-5-5`, effort `medium`');
    expect(md).toContain('24 tools, 22.582 caracteres, 6.000 tokens');
  });

  it('no incluye textos de tickets, respuestas del agente, argumentos ni el prompt', () => {
    const r = armarReporte(registros(), PRECIOS, new Date());
    for (const salida of [JSON.stringify(r), aMarkdown(r)]) {
      expect(salida).not.toContain(TEXTO_TICKET);
      expect(salida).not.toContain(RESPUESTA);
      expect(salida).not.toContain('PROMPT-SISTEMA-PRUEBA');
    }
  });

  it('si cambia un precio, cambian los costos sin volver a medir', () => {
    const antes = armarReporte(registros(), PRECIOS, new Date()).totales.v1!.costoTotalUsd;
    const caro = { modelos: { 'claude-opus-5-5': { ...PRECIOS.modelos['claude-opus-5-5'], salida: 40 } } };
    expect(armarReporte(registros(), caro, new Date()).totales.v1!.costoTotalUsd).toBeGreaterThan(antes);
  });

  it('indica cuando la ejecución se cortó por tope de costo', () => {
    const r = registros();
    r.fin = { tipo: 'fin', fecha: '', cortadaPorTope: true };
    expect(aMarkdown(armarReporte(r, PRECIOS, new Date()))).toContain('se cortó por tope de costo');
  });
});

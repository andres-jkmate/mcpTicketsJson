import { describe, expect, it } from 'vitest';
import type { ConversacionMedida } from './estimador.js';
import type { SupuestosEstimacion } from './guiones.js';
import { aMarkdownEstimacion, armarReporteEstimacion, type MedicionEstimada } from './reporte-estimacion.js';
import { leerArgumentosEstimacion } from '../estimar-agente.js';

const PRECIO = { entrada: 4, salida: 20, lecturaCache: 0.2, escrituraCache: 5 };
const SUPUESTOS: SupuestosEstimacion = { razonCaracteresPorToken: 3.5, thinkingPorTurno: 300, respuestaFinal: 400, promptToolUse: 346 };

const llamada = (tool: string, resultado: number) => ({ tool, interceptada: false, error: false, caracteresArgumentos: 40, caracteresResultado: resultado });
const conversacion = (caracteresTools: number, turnos: ConversacionMedida['turnos']): ConversacionMedida => ({
  cantidadTools: caracteresTools > 20_000 ? 24 : 6,
  caracteresTools,
  caracteresSistema: 350,
  caracteresPedido: 70,
  turnos,
});

const MEDICIONES: MedicionEstimada[] = [
  {
    caso: 'estado-ticket',
    version: 'v1',
    conversacion: conversacion(22_582, [{ llamadas: [llamada('detalle_ticket', 467)] }, { llamadas: [llamada('historial_ticket', 4_483), llamada('agendas_ticket', 445)] }, { llamadas: [] }]),
  },
  { caso: 'estado-ticket', version: 'v2', conversacion: conversacion(14_337, [{ llamadas: [llamada('obtener_contexto_ticket', 6_866)] }, { llamadas: [] }]) },
  { caso: 'mis-tareas-pendientes', version: 'v1', conversacion: conversacion(22_582, [{ llamadas: [llamada('listar_tareas_desarrollador', 9_000)] }, { llamadas: [] }]) },
  { caso: 'mis-tareas-pendientes', version: 'v2', conversacion: conversacion(14_337, [{ llamadas: [llamada('listar_tareas', 3_000)] }, { llamadas: [] }]) },
];

describe('reporte de la estimación', () => {
  const r = armarReporteEstimacion(MEDICIONES, SUPUESTOS, 'claude-opus-5-5', PRECIO, new Date('2026-10-20T15:00:00Z'));

  it('informa por caso y versión los turnos, los tokens y el costo en los dos escenarios', () => {
    const c = r.casos.find((x) => x.caso === 'estado-ticket')!;
    expect(c.v1!.turnos).toBe(3);
    expect(c.v2!.turnos).toBe(2);
    expect(c.v1!.llamadas).toBe(3);
    for (const e of ['sesionCaliente', 'sinCache'] as const) {
      expect(c.v1!.escenarios[e].costoUsd).toBeGreaterThan(c.v2!.escenarios[e].costoUsd);
      expect(c.diferencia[e]).toBeLessThan(0);
    }
    // La sesión caliente siempre cuesta menos que sin caché.
    expect(c.v1!.escenarios.sesionCaliente.costoUsd).toBeLessThan(c.v1!.escenarios.sinCache.costoUsd);
  });

  it('el total suma los casos y calcula la diferencia v1 → v2', () => {
    const suma = r.casos.reduce((s, c) => s + c.v2!.escenarios.sinCache.costoUsd, 0);
    expect(r.totales.v2!.escenarios.sinCache.costoUsd).toBeCloseTo(suma);
    expect(r.totales.v1!.turnos).toBe(5);
    const esperado = ((r.totales.v2!.escenarios.sesionCaliente.costoUsd - r.totales.v1!.escenarios.sesionCaliente.costoUsd) / r.totales.v1!.escenarios.sesionCaliente.costoUsd) * 100;
    expect(r.totales.diferencia.sesionCaliente).toBeCloseTo(esperado, 1);
  });

  it('incluye el rango con razones de 3 y 4 caracteres por token', () => {
    expect(r.rango.map((f) => f.razon)).toEqual([3, 4]);
    // Con menos caracteres por token hay más tokens y más costo.
    expect(r.rango[0]!.v1!.sinCache).toBeGreaterThan(r.rango[1]!.v1!.sinCache);
  });

  it('informa el tamaño de las definiciones de tools de cada versión', () => {
    expect(r.tools.v1).toMatchObject({ cantidad: 24, caracteres: 22_582 });
    expect(r.tools.v2!.tokens).toBeCloseTo(14_337 / 3.5);
  });

  it('el Markdown declara que es una estimación, sus supuestos y tiene una tabla por caso', () => {
    const md = aMarkdownEstimacion(r);
    expect(md).toMatch(/Es una estimación, no una medición/);
    expect(md).toMatch(/3,5 caracteres por token/);
    expect(md).toMatch(/## estado-ticket/);
    expect(md).toMatch(/## mis-tareas-pendientes/);
    expect(md).toMatch(/## Rango según la razón/);
    expect(md).toMatch(/\| 3,0 \|/);
  });

  it('no incluye textos: solo medidas en caracteres', () => {
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/"(texto|pedido|system|respuesta)"/);
  });
});

describe('argumentos de estimar:agente', () => {
  it('valores por defecto, listas y razón', () => {
    expect(leerArgumentosEstimacion([])).toEqual({ casos: undefined, versiones: ['v1', 'v2'] });
    expect(leerArgumentosEstimacion(['--casos', 'crear-tarea', '--versiones', 'v2', '--razon', '3,2'])).toEqual({ casos: ['crear-tarea'], versiones: ['v2'], razon: 3.2 });
  });

  it('rechaza valores inválidos', () => {
    expect(() => leerArgumentosEstimacion(['--razon', '0'])).toThrow(/--razon/);
    expect(() => leerArgumentosEstimacion(['--casos', 'otro'])).toThrow(/--casos/);
  });
});

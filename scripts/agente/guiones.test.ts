import { beforeAll, describe, expect, it } from 'vitest';
import { cargarListasTools, leerJson, type ListasTools } from './configuracion.js';
import { cargarEstimacion, cargarGuiones, rellenarArgumentos } from './guiones.js';

let listas: ListasTools;
let json: { guiones: Record<string, Record<string, unknown[]>> };

beforeAll(async () => {
  listas = cargarListasTools(await leerJson('tools.json'));
  json = (await leerJson('guiones.json')) as typeof json;
});

const copia = () => structuredClone(json);

describe('guiones.json', () => {
  it('el archivo versionado carga con los 5 casos y las dos versiones', () => {
    const guiones = cargarGuiones(json, listas);
    expect(Object.keys(guiones).sort()).toEqual(['crear-tarea', 'estado-ticket', 'mis-tareas-pendientes', 'mis-tickets-agendados', 'prioridad-mensaje']);
    expect(guiones['estado-ticket'].v1).toHaveLength(2);
    expect(guiones['estado-ticket'].v2).toHaveLength(1);
  });

  it('falla si falta alguno de los 5 casos', () => {
    const j = copia();
    delete j.guiones['crear-tarea'];
    expect(() => cargarGuiones(j, listas)).toThrow(/faltan guiones de los casos crear-tarea/);
  });

  it('falla si a un caso le falta una de las dos versiones', () => {
    const j = copia();
    delete j.guiones['mis-tareas-pendientes']!.v2;
    expect(() => cargarGuiones(j, listas)).toThrow(/mis-tareas-pendientes\.v2/);
  });

  it('falla si una llamada usa una tool que la versión no publica', () => {
    const j = copia();
    j.guiones['estado-ticket']!.v2 = [[{ tool: 'detalle_ticket', argumentos: { P_COD_RECLAMO: 74836 } }]];
    expect(() => cargarGuiones(j, listas)).toThrow(/la v2 no publica la tool detalle_ticket/);
  });

  it('reemplaza {hoy} en los argumentos', () => {
    expect(rellenarArgumentos({ a: '{hoy} 23:59', b: [1, '{hoy}'], c: 2 }, '2026-10-20')).toEqual({ a: '2026-10-20 23:59', b: [1, '2026-10-20'], c: 2 });
  });
});

describe('estimacion.json', () => {
  it('la configuración por defecto carga', async () => {
    expect(cargarEstimacion(await leerJson('estimacion.json'))).toMatchObject({ razonCaracteresPorToken: 3.5 });
  });

  it('rechaza una razón no positiva o un supuesto faltante', () => {
    expect(() => cargarEstimacion({ razonCaracteresPorToken: 0, thinkingPorTurno: 1, respuestaFinal: 1, promptToolUse: 1 })).toThrow(/razonCaracteresPorToken/);
    expect(() => cargarEstimacion({ razonCaracteresPorToken: 3.5, thinkingPorTurno: 1, respuestaFinal: 1 })).toThrow(/promptToolUse/);
  });
});

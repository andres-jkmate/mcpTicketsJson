import { describe, expect, it } from 'vitest';
import { cargarListasTools, cargarPrecios, esLectura, leerJson, precioDe } from './configuracion.js';

describe('precios.json', () => {
  it('el archivo versionado carga y tiene Opus 5.5', async () => {
    const precios = cargarPrecios(await leerJson('precios.json'));
    expect(precioDe(precios, 'claude-opus-5-5')).toEqual({ entrada: 4, salida: 20, lecturaCache: 0.2, escrituraCache: 5 });
  });

  it('rechaza un modelo sin precio', async () => {
    const precios = cargarPrecios(await leerJson('precios.json'));
    expect(() => precioDe(precios, 'claude-inexistente')).toThrow(/no tiene precio/);
  });

  it('rechaza un precio incompleto o negativo', () => {
    expect(() => cargarPrecios({ modelos: { m: { entrada: 1, salida: 2, lecturaCache: 0.1 } } })).toThrow(/escrituraCache/);
    expect(() => cargarPrecios({ modelos: { m: { entrada: -1, salida: 2, lecturaCache: 0.1, escrituraCache: 1 } } })).toThrow();
  });
});

describe('tools.json', () => {
  it('el archivo versionado carga: v1 = 24 tools y v2 = 6', async () => {
    const listas = cargarListasTools(await leerJson('tools.json'));
    expect(listas.v1.lectura.length + listas.v1.escritura.length).toBe(24);
    expect(listas.v2.lectura.length + listas.v2.escritura.length).toBe(6);
  });

  it('rechaza una tool que figura en las dos listas', () => {
    const json = { v1: { lectura: ['a', 'crear_tarea'], escritura: ['crear_tarea'] }, v2: { lectura: [], escritura: [] } };
    expect(() => cargarListasTools(json)).toThrow(/crear_tarea/);
  });

  it('una tool desconocida no es de lectura (se intercepta)', async () => {
    const listas = cargarListasTools(await leerJson('tools.json'));
    expect(esLectura(listas, 'v1', 'detalle_ticket')).toBe(true);
    expect(esLectura(listas, 'v1', 'crear_tarea')).toBe(false);
    expect(esLectura(listas, 'v1', 'tool_nueva')).toBe(false);
  });
});

import { afterAll, describe, expect, it } from 'vitest';
import { cargarConfig } from '../../src/config.js';
import { abrirBase, coincidencias, normalizar, obtenerReferencia, type BaseLectura, type Desarrollador } from './base.js';
import { cargarCasos } from './casos.js';
import { leerJson } from './configuracion.js';

const d = (id: number, nombre: string, nombresUsuario: string[] = [], activo = true): Desarrollador => ({ id, nombre, alias: null, activo, nombresUsuario });
const DESARROLLADORES = [
  d(100934, 'GOVIEDO', ['GUSTAVO OVIEDO']),
  d(1008413, 'LOVIEDO-FUTUROJK3-OFICJK3'),
  d(11167111, 'USUARIOPROD-RAMONOVIEDOTEST'),
  d(100936, 'APELAEZ', ['Andres Pelaez', 'APELAEZ']),
  d(5, 'GOVIEDO2', ['Gustavo Oviedo'], false),
];

describe('resolución de desarrolladores por nombre', () => {
  it('normaliza tildes y mayúsculas', () => {
    expect(normalizar('  Andrés  Peláez ')).toBe('ANDRES PELAEZ');
  });

  it('"Gustavo Oviedo" resuelve a uno solo (ignora inactivos)', () => {
    expect(coincidencias(DESARROLLADORES, 'Gustavo Oviedo').map((x) => x.id)).toEqual([100934]);
  });

  it('"Oviedo" es ambiguo', () => {
    expect(coincidencias(DESARROLLADORES, 'Oviedo').length).toBeGreaterThan(1);
  });

  it('el nombre de usuario exacto gana', () => {
    expect(coincidencias(DESARROLLADORES, 'goviedo').map((x) => x.id)).toEqual([100934]);
  });

  it('un nombre inexistente no resuelve', () => {
    expect(coincidencias(DESARROLLADORES, 'Nadie Nunca')).toEqual([]);
  });
});

const hayBase = Boolean(process.env.FIREBIRD_DATABASE);

describe.skipIf(!hayBase)('verdad de referencia contra la base de prueba', { timeout: 120_000 }, () => {
  let base: BaseLectura;
  afterAll(async () => base?.cerrar());

  it('obtiene datos no vacíos para los casos 1, 2 y 3 y resuelve el desarrollador del caso 4', async () => {
    const config = cargarConfig();
    base = abrirBase(config);
    const { casos } = cargarCasos(await leerJson('casos.json'));
    const ref = await obtenerReferencia(base, casos, config.MCP_COD_USUARIO);
    expect(ref['estado-ticket']?.estado).toBeTruthy();
    expect(ref['mis-tickets-agendados']?.ids.length).toBeGreaterThan(0);
    expect(ref['mis-tareas-pendientes']?.total).toBeGreaterThan(0);
    expect(ref['crear-tarea']?.desarrolladorId).toBe(100934);
    expect(await base.existeTicket(75056)).toBe(true);
    expect(await base.existeTicket(999_999_999)).toBe(false);
    expect(await base.existeDesarrollador(100934)).toBe(true);
  });
});

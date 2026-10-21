import { describe, expect, it } from 'vitest';
import type { VerdadReferencia } from './base.js';
import type { Caso } from './casos.js';
import type { Version } from './configuracion.js';
import type { RegistroEscritura } from './interceptor.js';
import { FALTAN_DATOS, mencionaNumero, verificar } from './verificacion.js';

const REF: VerdadReferencia = {
  codUsuario: 15169,
  codDesarrollador: 100936,
  'estado-ticket': { ticketId: 74836, estado: 'AGENDADO', resultado: 'AGENDADO', tareasAbiertas: [6210] },
  'mis-tickets-agendados': { ids: [75035, 75004, 74836], total: 3 },
  'mis-tareas-pendientes': { ids: Array.from({ length: 29 }, (_, i) => 6000 + i), total: 29 },
  'crear-tarea': { ticketId: 74836, desarrolladorId: 100934 },
  'prioridad-mensaje': { ticketId: 75056, prioridad: 'ALTA' },
};
const c = { pedido: 'p', criterio: 'c' };
const CASOS = {
  estado: { id: 'estado-ticket', tipo: 'lectura', ticketId: 74836, ...c },
  agendados: { id: 'mis-tickets-agendados', tipo: 'lectura', ...c },
  tareas: { id: 'mis-tareas-pendientes', tipo: 'lectura', ...c },
  crear: { id: 'crear-tarea', tipo: 'escritura', ticketId: 74836, desarrollador: { id: 100934, nombre: 'Gustavo Oviedo' }, ...c },
  prioridad: { id: 'prioridad-mensaje', tipo: 'escritura', ticketId: 75056, prioridad: 'ALTA', ...c },
} satisfies Record<string, Caso>;

const lectura = (caso: Caso, respuesta: string) =>
  verificar({ caso, version: 'v2', referencia: REF, fin: 'end_turn', respuestaFinal: respuesta, escrituras: [] });
const escritura = (caso: Caso, version: Version, escrituras: Partial<RegistroEscritura>[]) =>
  verificar({
    caso,
    version,
    referencia: REF,
    fin: 'end_turn',
    respuestaFinal: 'Listo.',
    escrituras: escrituras.map((e) => ({ tool: '', argumentos: {}, valida: true, errores: [], resueltos: {}, plantillaGenerica: false, ...e })),
  });

describe('lecturas', () => {
  it('mencionaNumero acepta separadores de miles y #, no números más largos', () => {
    expect(mencionaNumero('el #74.836 y', 74836)).toBe(true);
    expect(mencionaNumero('748360', 74836)).toBe(false);
  });

  it('caso 1: estado y tareas abiertas', () => {
    expect(lectura(CASOS.estado, 'Está Agendado; falta la tarea 6210.').exito).toBe(true);
    expect(lectura(CASOS.estado, 'Está agendado.')).toEqual({ exito: false, motivo: `${FALTAN_DATOS}: tareas 6210` });
  });

  it('caso 2 con 3 agendados: mencionar 2 es "faltan datos esperados"', () => {
    expect(lectura(CASOS.agendados, '#75035 y #75004').motivo).toMatch(new RegExp(`^${FALTAN_DATOS}`));
    expect(lectura(CASOS.agendados, '75035, 75004 y 74836').exito).toBe(true);
  });

  it('caso 3 con más de 25: alcanza con el total correcto', () => {
    expect(lectura(CASOS.tareas, 'Tenés 29 tareas pendientes, las más urgentes son 6000 y 6001.').exito).toBe(true);
    expect(lectura(CASOS.tareas, 'Tenés 30 tareas pendientes.').exito).toBe(false);
  });

  it('una corrida sin respuesta final, con rechazo o por límite de turnos falla con el motivo', () => {
    for (const fin of ['max_turnos', 'refusal', 'sin_respuesta'] as const) {
      expect(verificar({ caso: CASOS.estado, version: 'v1', referencia: REF, fin, respuestaFinal: null, escrituras: [] }).motivo).toContain(fin);
    }
  });
});

describe('caso 4: crear tarea', () => {
  const v1 = (args: Record<string, unknown>) => ({ tool: 'crear_tarea', argumentos: { NOMBRE: 'Revisar error', COD_DESARROLLADOR: 100934, NRO_TICKET: '74836', DESCRIPCION: 'Criterios de aceptación: no se reproduce', ...args } });
  const v2 = (args: Record<string, unknown>, desarrollador = 100934) => ({
    tool: 'crear_tarea',
    argumentos: { tarea: { nombre: 'Revisar error' }, asignacion: { desarrollador: { nombre: 'Gustavo Oviedo' } }, ticketId: 74836, descripcion: { pedido: 'x', criteriosAceptacion: ['no se reproduce'] }, ...args },
    resueltos: { 'asignacion.desarrollador': desarrollador },
  });

  it('v1 y v2 correctas', () => {
    expect(escritura(CASOS.crear, 'v1', [v1({})]).exito).toBe(true);
    expect(escritura(CASOS.crear, 'v2', [v2({})]).exito).toBe(true);
  });

  it('ticket distinto de 74836 → fallida (v1 y v2)', () => {
    expect(escritura(CASOS.crear, 'v1', [v1({ NRO_TICKET: '74111' })]).exito).toBe(false);
    expect(escritura(CASOS.crear, 'v2', [v2({ ticketId: 74111 })]).exito).toBe(false);
  });

  it('otro desarrollador, sin criterios o dos creaciones → fallida', () => {
    expect(escritura(CASOS.crear, 'v2', [v2({}, 1008413)]).motivo).toContain('desarrollador');
    expect(escritura(CASOS.crear, 'v1', [v1({ DESCRIPCION: 'Revisar' })]).motivo).toContain('criterios');
    expect(escritura(CASOS.crear, 'v1', [v1({}), v1({})]).motivo).toContain('única');
  });

  it('un intento inválido previo no cuenta', () => {
    expect(escritura(CASOS.crear, 'v2', [{ ...v2({}), valida: false }, v2({})]).exito).toBe(true);
  });
});

describe('caso 5: prioridad + mensaje', () => {
  it('v1: una llamada con P_NUEVA_PRIORIDAD y P_MENSAJE', () => {
    const args = { P_COD_RECLAMO: 75056, P_NUEVA_PRIORIDAD: 'ALTA', P_MENSAJE: 'Lo estamos priorizando' };
    expect(escritura(CASOS.prioridad, 'v1', [{ tool: 'agregar_mensaje_ticket', argumentos: args }]).exito).toBe(true);
  });

  it('v2: actualizar_ticket con cambios y mensaje', () => {
    const args = { ticketId: 75056, cambios: { prioridad: 'ALTA' }, mensaje: { texto: 'Lo estamos priorizando' } };
    expect(escritura(CASOS.prioridad, 'v2', [{ tool: 'actualizar_ticket', argumentos: args }]).exito).toBe(true);
  });

  it('sin mensaje, con otra prioridad o sobre otro ticket → fallida', () => {
    expect(escritura(CASOS.prioridad, 'v2', [{ tool: 'actualizar_ticket', argumentos: { ticketId: 75056, cambios: { prioridad: 'ALTA' } } }]).motivo).toContain('sin mensaje');
    expect(escritura(CASOS.prioridad, 'v1', [{ tool: 'agregar_mensaje_ticket', argumentos: { P_COD_RECLAMO: 75056, P_NUEVA_PRIORIDAD: 'MEDIA', P_MENSAJE: 'x' } }]).exito).toBe(false);
    expect(escritura(CASOS.prioridad, 'v1', [{ tool: 'agregar_mensaje_ticket', argumentos: { P_COD_RECLAMO: 74836, P_NUEVA_PRIORIDAD: 'ALTA', P_MENSAJE: 'x' } }]).exito).toBe(false);
  });
});

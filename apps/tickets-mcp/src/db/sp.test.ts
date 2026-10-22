import { describe, expect, it } from 'vitest';
import type { EjecutarSp, Fila, ValorParametro } from '@mcp-jkmate/firebird';
import {
  listarAdjuntosTicket,
  listarAgendasTicket,
  listarHistorial,
  listarPresupuestosTicket,
  listarTareas,
  listarTickets,
  obtenerTicket,
  resumirTickets,
} from './sp.js';

/** EjecutarSp simulado: registra las llamadas y devuelve las filas indicadas. */
function spSimulado(filas: Fila[] = []) {
  const llamadas: { nombre: string; parametros: ValorParametro[] }[] = [];
  const sp: EjecutarSp = async (nombre, parametros) => {
    llamadas.push({ nombre, parametros });
    return filas.map((f) => ({ ...f }));
  };
  return { sp, llamadas };
}

const ERROR = { RESULTADO: 0, MENSAJE_ERROR: 'Límite entre 1 y 100 y desplazamiento >= 0' };

describe('wrappers de los 8 SP públicos', () => {
  it('PROC_GET_TICKET_AG: una fila o null', async () => {
    const { sp, llamadas } = spSimulado([{ RESULTADO: 1, MENSAJE_ERROR: '', COD_RECLAMO: 74836, ESTADO: 'AGENDADO' }]);
    expect(await obtenerTicket(sp, 74836)).toEqual({ COD_RECLAMO: 74836, ESTADO: 'AGENDADO' });
    expect(llamadas).toEqual([{ nombre: 'PROC_GET_TICKET_AG', parametros: [74836] }]);
    expect(await obtenerTicket(spSimulado().sp, 1)).toBeNull();
  });

  it('PROC_LIST_HIST_TICKET_AG: banderas como 0/1', async () => {
    const { sp, llamadas } = spSimulado();
    await listarHistorial(sp, { codReclamo: 74836, soloVisibleCliente: true, limite: 50 });
    await listarHistorial(sp, { codReclamo: 74836, limite: 10 });
    expect(llamadas.map((l) => l.parametros)).toEqual([
      [74836, 1, 50],
      [74836, 0, 10],
    ]);
  });

  it('PROC_LIST_TICKETS_AG: arreglos a CSV, opcionales a NULL y defaults', async () => {
    const { sp, llamadas } = spSimulado();
    await listarTickets(sp, {
      estados: ['INICIADO', 'AGENDADO'],
      prioridades: ['ALTA'],
      codUsuarioAsignado: 15169,
      creadoDesde: '2026-09-01',
      texto: 'asiento',
      orden: 'agenda',
      limite: 20,
      desplazamiento: 40,
    });
    expect(llamadas[0]).toEqual({
      nombre: 'PROC_LIST_TICKETS_AG',
      parametros: ['INICIADO,AGENDADO', 1, 'ALTA', null, 15169, null, null, '2026-09-01', null, 'asiento', 0, 'agenda', 20, 40],
    });
  });

  it('PROC_LIST_TICKETS_AG: propaga el error de validación del SP', async () => {
    const { sp } = spSimulado([ERROR]);
    await expect(listarTickets(sp, { orden: 'actualizacion', limite: 500, desplazamiento: 0 })).rejects.toMatchObject({
      codigo: 'PARAMETRO_INVALIDO',
    });
  });

  it('PROC_LIST_RESUMEN_TICKETS_AG: dimensión primero y mismos filtros', async () => {
    const { sp, llamadas } = spSimulado([
      { RESULTADO: 1, MENSAJE_ERROR: '', TOTAL: 12, CLAVE_ID: null, CLAVE: 'AGENDADO', CANTIDAD: 7 },
    ]);
    const filas = await resumirTickets(sp, 'ESTADO', { soloAbiertos: false, sistema: 'JK3' });
    expect(filas).toEqual([{ TOTAL: 12, CLAVE_ID: null, CLAVE: 'AGENDADO', CANTIDAD: 7 }]);
    expect(llamadas[0]?.parametros).toEqual(['ESTADO', null, 0, null, 'JK3', null, null, null, null, null, null, 0]);
  });

  it('PROC_LIST_TAREAS_AG: soloPendientes por defecto y descansos apagados', async () => {
    const { sp, llamadas } = spSimulado();
    await listarTareas(sp, { codReclamo: 74703, limite: 2, desplazamiento: 0 });
    expect(llamadas[0]).toEqual({
      nombre: 'PROC_LIST_TAREAS_AG',
      parametros: [null, null, 74703, null, 1, null, null, null, 0, 2, 0],
    });
  });

  it.each([
    ['PROC_LIST_AGENDAS_TICKET_AG', listarAgendasTicket],
    ['PROC_LIST_PRESUP_TICKET_AG', listarPresupuestosTicket],
    ['PROC_LIST_ADJUNTOS_TICKET_AG', listarAdjuntosTicket],
  ] as const)('%s recibe solo el ticket y aplica el contrato', async (nombre, wrapper) => {
    const { sp, llamadas } = spSimulado([{ RESULTADO: 1, MENSAJE_ERROR: '', X: 1 }]);
    expect(await wrapper(sp, 74836)).toEqual([{ X: 1 }]);
    expect(llamadas).toEqual([{ nombre, parametros: [74836] }]);
    await expect(wrapper(spSimulado([{ RESULTADO: 0, MENSAJE_ERROR: 'Falta el número de ticket' }]).sp, 0)).rejects.toMatchObject({
      codigo: 'PARAMETRO_INVALIDO',
    });
  });
});

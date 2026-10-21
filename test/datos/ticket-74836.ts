import type { Fila } from '../../src/db/firebird.js';
import { r, type ManejadorSp } from '../apoyo.js';

/*
 * Salida simulada de los SP `_AG` para el #74836 (y casos derivados), armada con los datos de la
 * base de testing del 2026-10-16 que figuran en design D4.
 */

export const TICKET_74836: Fila = {
  COD_RECLAMO: 74836,
  TITULO: 'error al cargar asiento',
  ESTADO: 'AGENDADO',
  RESULTADO_RECLAMO: 'AGENDADO',
  PRIORIDAD: 'CRITICA',
  TIPO_SISTEMA: 'JK3',
  COD_PROCESO_SISTEMA: 488,
  PROCESO_SISTEMA: 'Ingreso de Asientos',
  COD_CLIENTE: 502312,
  CLIENTE: 'Suscripciones del Cielo SA',
  CONTACTO: 'julieta marchan',
  COD_USUARIO_ASIG: 15169,
  USUARIO_ASIG: 'Andres Pelaez',
  FECHA_CREACION: r('2026-09-28 15:44:11.925'),
  FECHA_ULTIMO_CAMBIO: r('2026-10-05 13:09:35.383'),
  PEDIDO_NORMALIZADO: null,
};

const base = {
  COD_USUARIO_DESTINO: null,
  USUARIO_DESTINO: null,
  ES_MENSAJE_CLIENTE: 0,
  VISIBLE_CLIENTE: 1,
  ADJUNTOS: 0,
  COD_MENSAJE_RESPUESTA: null,
};

export const HISTORIAL_74836: Fila[] = [
  {
    ...base,
    COD_MENSAJE_CLIENTE: 17141,
    FECHA_HORA: r('2026-09-28 15:44:11.925'),
    TIPO_HITO: 'MENSAJE',
    MENSAJE: '<p>Titulo: error al cargar asiento</p><p>no puedo cargar e3l asiento por un error adjujnto imagen</p>',
    TEXTO_HITO: '<p>Titulo: error al cargar asiento</p><p>no puedo cargar e3l asiento por un error adjujnto imagen</p>',
    RESULTADO_RECLAMO: 'INICIADO',
    COD_USUARIO: 15246,
    USUARIO: 'SANTOS LARA',
    ES_MENSAJE_CLIENTE: 1,
  },
  {
    ...base,
    COD_MENSAJE_CLIENTE: 17303,
    FECHA_HORA: r('2026-09-30 11:39:17.147'),
    TIPO_HITO: 'MENSAJE',
    MENSAJE: 'adjutno archivos que antes no me adjunto',
    TEXTO_HITO: 'adjutno archivos que antes no me adjunto',
    RESULTADO_RECLAMO: 'INICIADO',
    COD_USUARIO: 15246,
    USUARIO: 'SANTOS LARA',
    ES_MENSAJE_CLIENTE: 1,
    ADJUNTOS: 2,
  },
  {
    ...base,
    COD_MENSAJE_CLIENTE: 17310,
    FECHA_HORA: r('2026-09-30 13:02:47.946'),
    TIPO_HITO: 'ASIGNACION',
    MENSAJE: 'Prioridad cambiada a CRITICA',
    TEXTO_HITO: 'Ticket asignado a ANDRES JKMT',
    RESULTADO_RECLAMO: 'INICIADO',
    COD_USUARIO: 22,
    USUARIO: 'Soporte Clientes',
    COD_USUARIO_DESTINO: 15169,
    USUARIO_DESTINO: 'Andres Pelaez',
  },
  {
    ...base,
    COD_MENSAJE_CLIENTE: 17311,
    FECHA_HORA: r('2026-09-30 13:02:47.946'),
    TIPO_HITO: 'MENSAJE',
    MENSAJE: 'Se revisara el error.',
    TEXTO_HITO: 'Se revisara el error.',
    RESULTADO_RECLAMO: 'INICIADO',
    COD_USUARIO: 22,
    USUARIO: 'Soporte Clientes',
    COD_USUARIO_DESTINO: 15169,
    USUARIO_DESTINO: 'Andres Pelaez',
  },
  {
    ...base,
    COD_MENSAJE_CLIENTE: 17697,
    FECHA_HORA: r('2026-10-05 13:09:35.383'),
    TIPO_HITO: 'CAMBIO_ESTADO',
    MENSAJE: 'Ticket agendado el dia 2026-10-06 a las 09:00:00.0000 horas para el usuario Andres Pelaez',
    TEXTO_HITO: 'Estado cambiado de INICIADO a AGENDADO',
    RESULTADO_RECLAMO: 'AGENDADO',
    COD_USUARIO: 15169,
    USUARIO: 'Andres Pelaez',
    COD_USUARIO_DESTINO: 15169,
    USUARIO_DESTINO: 'Andres Pelaez',
  },
];

export const AGENDAS_74836: Fila[] = [
  {
    COD_EVENTO: 156,
    FECHA_EVENTO: r('2026-10-06 09:00:00'),
    FECHA_HASTA: r('2026-10-06 09:50:00'),
    TODO_DIA: 0,
    REALIZADO: 0,
    COD_USUARIO_AGENDA: 15169,
    USUARIO_AGENDA: 'Andres Pelaez',
  },
];

const URL_ADJ = 'https://ticket.jakemate.net:19089/api/Files/attachments/ticket/';
export const ADJUNTOS_74836: Fila[] = [
  {
    COD_ARCHIVO: 6168,
    RUTA: `${URL_ADJ}78B92411E06CEEF0AD2D773CFAF867E8.png`,
    RUTA_REAL: 'D:\\Adjuntos\\ticket\\78B92411E06CEEF0AD2D773CFAF867E8.png',
    OBSERVACION: '',
    COD_MENSAJE_CLIENTE: 17303,
    FECHA: r('2026-09-30'),
  },
  {
    COD_ARCHIVO: 6169,
    RUTA: `${URL_ADJ}3EF72423FB95A481914EF9887CA29A52.png`,
    RUTA_REAL: 'D:\\Adjuntos\\ticket\\3EF72423FB95A481914EF9887CA29A52.png',
    OBSERVACION: null,
    COD_MENSAJE_CLIENTE: 17303,
    FECHA: r('2026-09-30'),
  },
];

export const PRESUPUESTO_74619: Fila = {
  NRO_COMPROBANTE: 'P-0001-00000088',
  FECHA: r('2026-10-05'),
  ESTADO: 'APROBADO',
  IMPORTE: 121,
  FECHA_HORA_APROBO: r('2026-10-07 09:35:22.378'),
};

/** Emula PROC_LIST_HIST_TICKET_AG: filtro de visibilidad, últimos N en orden ascendente y TOTAL. */
export function historialSimulado(movimientos: Fila[]): ManejadorSp {
  return ([, soloVisible, limite]) => {
    const visibles = soloVisible === 1 ? movimientos.filter((m) => m.VISIBLE_CLIENTE === 1) : movimientos;
    return visibles.slice(-Number(limite)).map((m) => ({ ...m, TOTAL: visibles.length }));
  };
}

export interface OpcionesTicket {
  ticket?: Fila | null;
  historial?: Fila[];
  tareas?: Fila[];
  agendas?: Fila[];
  presupuestos?: Fila[];
  adjuntos?: Fila[];
}

/** Manejadores de los 6 SP del contexto, con el #74836 por defecto. */
export function spsContexto(o: OpcionesTicket = {}): Record<string, ManejadorSp> {
  const ticket = o.ticket === undefined ? TICKET_74836 : o.ticket;
  const tareas = o.tareas ?? [];
  return {
    PROC_GET_TICKET_AG: () => (ticket ? [ticket] : []),
    PROC_LIST_HIST_TICKET_AG: historialSimulado(o.historial ?? HISTORIAL_74836),
    PROC_LIST_TAREAS_AG: () => tareas.map((t) => ({ ...t, TOTAL: tareas.length })),
    PROC_LIST_AGENDAS_TICKET_AG: () => o.agendas ?? AGENDAS_74836,
    PROC_LIST_PRESUP_TICKET_AG: () => o.presupuestos ?? [],
    PROC_LIST_ADJUNTOS_TICKET_AG: () => o.adjuntos ?? ADJUNTOS_74836,
  };
}

export function tareaSimulada(campos: Partial<Fila> = {}): Fila {
  return {
    COD_ASIGNACION_JK3: 6248,
    NOMBRE: 'Asientos de compras sin nombre del Proveedor',
    DESCRIPCION: 'Detalle largo de la tarea',
    ESTADO_ASIGNACION: 'FINALIZA DESARROLLO',
    PRIORIDAD: 2,
    COD_TIPO_ASIGNACION_JK3: 1,
    TIPO_ASIGNACION: 'DESARROLLO',
    COD_RECLAMO: 74703,
    COD_DESARROLLADOR: 100936,
    DESARROLLADOR: 'Andres Pelaez',
    COD_DESARROLLADOR_RESP: 100936,
    DESARROLLADOR_RESP: 'Andres Pelaez',
    HORAS_ESTIMADAS: 2,
    FECHA_COMPROMISO: null,
    FECHA_HORA_CREA: r('2026-10-07 11:29:47.440'),
    ...campos,
  };
}

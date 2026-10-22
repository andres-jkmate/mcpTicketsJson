import { ErrorTool } from '../errores.js';
import type { EjecutarSp, Fila, ValorParametro } from './firebird.js';

/*
 * Wrappers tipados de los 8 SP públicos `_AG` (design D8). Cada uno arma los parámetros en el
 * orden de la firma, aplica el contrato RESULTADO/MENSAJE_ERROR y devuelve filas tipadas sin
 * esas dos columnas. Fechas de parámetro: 'AAAA-MM-DD'. Fechas de resultado: "reloj" (Date).
 */

const PREFIJO_NO_AUTORIZADO = 'NO_AUTORIZADO:';

/**
 * Contrato de los selectables: 1 fila con RESULTADO = 0 es un error de validación; si no, cada
 * fila trae RESULTADO = 1. Cero filas = sin datos.
 */
export function aplicarContrato<T>(nombreSp: string, filas: Fila[]): T[] {
  const primera = filas[0];
  if (primera && primera.RESULTADO === 0) {
    const mensaje = String(primera.MENSAJE_ERROR ?? '').trim() || `Parámetros inválidos para ${nombreSp}`;
    if (mensaje.startsWith(PREFIJO_NO_AUTORIZADO)) {
      throw new ErrorTool('NO_AUTORIZADO', mensaje.slice(PREFIJO_NO_AUTORIZADO.length).trim());
    }
    throw new ErrorTool('PARAMETRO_INVALIDO', mensaje);
  }
  return filas.map((fila) => {
    const { RESULTADO: _r, MENSAJE_ERROR: _m, ...resto } = fila;
    return resto as T;
  });
}

const bandera = (valor: boolean | undefined, porDefecto: boolean): number => ((valor ?? porDefecto) ? 1 : 0);
const csv = (valores: readonly string[] | undefined): string | null => (valores?.length ? valores.join(',') : null);
const opcional = <T extends ValorParametro>(valor: T | undefined): T | null => valor ?? null;

async function llamar<T>(sp: EjecutarSp, nombre: string, parametros: ValorParametro[]): Promise<T[]> {
  return aplicarContrato<T>(nombre, await sp(nombre, parametros));
}

// ---------------------------------------------------------------- tickets

export interface FilaTicket {
  COD_RECLAMO: number;
  TITULO: string;
  ESTADO: string;
  RESULTADO_RECLAMO: string | null;
  PRIORIDAD: string;
  TIPO_SISTEMA: string | null;
  COD_PROCESO_SISTEMA: number | null;
  PROCESO_SISTEMA: string | null;
  COD_CLIENTE: number;
  CLIENTE: string | null;
  CONTACTO: string | null;
  COD_USUARIO_ASIG: number | null;
  USUARIO_ASIG: string | null;
  FECHA_CREACION: Date;
  FECHA_ULTIMO_CAMBIO: Date;
  PEDIDO_NORMALIZADO: string | null;
}

export async function obtenerTicket(sp: EjecutarSp, codReclamo: number): Promise<FilaTicket | null> {
  const filas = await llamar<FilaTicket>(sp, 'PROC_GET_TICKET_AG', [codReclamo]);
  return filas[0] ?? null;
}

export interface FilaHistorial {
  TOTAL: number;
  COD_MENSAJE_CLIENTE: number;
  FECHA_HORA: Date;
  TIPO_HITO: string;
  TEXTO_HITO: string | null;
  RESULTADO_RECLAMO: string | null;
  COD_USUARIO: number | null;
  USUARIO: string | null;
  COD_USUARIO_DESTINO: number | null;
  USUARIO_DESTINO: string | null;
  MENSAJE: string | null;
  ES_MENSAJE_CLIENTE: number | null;
  VISIBLE_CLIENTE: number | null;
  ADJUNTOS: number | null;
  COD_MENSAJE_RESPUESTA: number | null;
}

export async function listarHistorial(
  sp: EjecutarSp,
  p: { codReclamo: number; soloVisibleCliente?: boolean; limite: number },
): Promise<FilaHistorial[]> {
  return llamar<FilaHistorial>(sp, 'PROC_LIST_HIST_TICKET_AG', [
    p.codReclamo,
    bandera(p.soloVisibleCliente, false),
    p.limite,
  ]);
}

/** Filtros compartidos por PROC_LIST_TICKETS_AG y PROC_LIST_RESUMEN_TICKETS_AG. */
export interface FiltrosTickets {
  estados?: readonly string[];
  soloAbiertos?: boolean;
  prioridades?: readonly string[];
  sistema?: string;
  codUsuarioAsignado?: number;
  agendadoA?: number;
  codCliente?: number;
  creadoDesde?: string;
  creadoHasta?: string;
  texto?: string;
  buscarEnMensajes?: boolean;
}

function parametrosFiltros(f: FiltrosTickets): ValorParametro[] {
  return [
    csv(f.estados),
    bandera(f.soloAbiertos, true),
    csv(f.prioridades),
    opcional(f.sistema),
    opcional(f.codUsuarioAsignado),
    opcional(f.agendadoA),
    opcional(f.codCliente),
    opcional(f.creadoDesde),
    opcional(f.creadoHasta),
    opcional(f.texto),
    bandera(f.buscarEnMensajes, false),
  ];
}

export interface FilaListadoTicket {
  TOTAL: number;
  COD_RECLAMO: number;
  TITULO: string;
  ESTADO: string;
  PRIORIDAD: string;
  TIPO_SISTEMA: string | null;
  COD_CLIENTE: number;
  CLIENTE: string | null;
  COD_USUARIO_ASIG: number | null;
  USUARIO_ASIG: string | null;
  FECHA_CREACION: Date;
  FECHA_ULTIMO_CAMBIO: Date;
  AGENDA_FECHA: Date | null;
  AGENDA_COD_USUARIO: number | null;
  AGENDA_USUARIO: string | null;
  ESTADO_PRESUPUESTO: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | null;
}

export type OrdenTickets = 'actualizacion' | 'creacion' | 'agenda';

export async function listarTickets(
  sp: EjecutarSp,
  p: FiltrosTickets & { orden: OrdenTickets; limite: number; desplazamiento: number },
): Promise<FilaListadoTicket[]> {
  return llamar<FilaListadoTicket>(sp, 'PROC_LIST_TICKETS_AG', [
    ...parametrosFiltros(p),
    p.orden,
    p.limite,
    p.desplazamiento,
  ]);
}

export type DimensionResumen = 'ESTADO' | 'PRIORIDAD' | 'SISTEMA' | 'CLIENTE' | 'ASIGNADO';

export interface FilaResumen {
  TOTAL: number;
  CLAVE_ID: number | null;
  CLAVE: string | null;
  CANTIDAD: number;
}

export async function resumirTickets(
  sp: EjecutarSp,
  dimension: DimensionResumen,
  filtros: FiltrosTickets,
): Promise<FilaResumen[]> {
  return llamar<FilaResumen>(sp, 'PROC_LIST_RESUMEN_TICKETS_AG', [dimension, ...parametrosFiltros(filtros)]);
}

// ---------------------------------------------------------------- tareas

export interface FilaTarea {
  TOTAL: number;
  COD_ASIGNACION_JK3: number;
  NOMBRE: string;
  DESCRIPCION: string | null;
  ESTADO_ASIGNACION: string;
  PRIORIDAD: number | null;
  COD_TIPO_ASIGNACION_JK3: number | null;
  TIPO_ASIGNACION: string | null;
  COD_RECLAMO: number | null;
  COD_DESARROLLADOR: number | null;
  DESARROLLADOR: string | null;
  COD_DESARROLLADOR_RESP: number | null;
  DESARROLLADOR_RESP: string | null;
  HORAS_ESTIMADAS: number | null;
  FECHA_COMPROMISO: Date | null;
  FECHA_HORA_CREA: Date;
}

export interface FiltrosTareas {
  codDesarrollador?: number;
  codDesarrolladorResponsable?: number;
  codReclamo?: number;
  estados?: readonly string[];
  soloPendientes?: boolean;
  prioridad?: number;
  creadaDesde?: string;
  creadaHasta?: string;
  incluirDescansos?: boolean;
  limite: number;
  desplazamiento: number;
}

export async function listarTareas(sp: EjecutarSp, p: FiltrosTareas): Promise<FilaTarea[]> {
  return llamar<FilaTarea>(sp, 'PROC_LIST_TAREAS_AG', [
    opcional(p.codDesarrollador),
    opcional(p.codDesarrolladorResponsable),
    opcional(p.codReclamo),
    csv(p.estados),
    bandera(p.soloPendientes, true),
    opcional(p.prioridad),
    opcional(p.creadaDesde),
    opcional(p.creadaHasta),
    bandera(p.incluirDescansos, false),
    p.limite,
    p.desplazamiento,
  ]);
}

// ---------------------------------------------------------------- agendas, presupuestos y adjuntos

export interface FilaAgenda {
  COD_EVENTO: number;
  FECHA_EVENTO: Date;
  FECHA_HASTA: Date | null;
  TODO_DIA: number | null;
  REALIZADO: number | null;
  COD_USUARIO_AGENDA: number;
  USUARIO_AGENDA: string | null;
}

export async function listarAgendasTicket(sp: EjecutarSp, codReclamo: number): Promise<FilaAgenda[]> {
  return llamar<FilaAgenda>(sp, 'PROC_LIST_AGENDAS_TICKET_AG', [codReclamo]);
}

export interface FilaPresupuesto {
  NRO_COMPROBANTE: string;
  FECHA: Date;
  ESTADO: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
  IMPORTE: number;
  FECHA_HORA_APROBO: Date | null;
}

export async function listarPresupuestosTicket(sp: EjecutarSp, codReclamo: number): Promise<FilaPresupuesto[]> {
  return llamar<FilaPresupuesto>(sp, 'PROC_LIST_PRESUP_TICKET_AG', [codReclamo]);
}

export interface FilaAdjunto {
  COD_ARCHIVO: number;
  RUTA: string;
  RUTA_REAL: string | null;
  OBSERVACION: string | null;
  COD_MENSAJE_CLIENTE: number;
  FECHA: Date;
}

export async function listarAdjuntosTicket(sp: EjecutarSp, codReclamo: number): Promise<FilaAdjunto[]> {
  return llamar<FilaAdjunto>(sp, 'PROC_LIST_ADJUNTOS_TICKET_AG', [codReclamo]);
}

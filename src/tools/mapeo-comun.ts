import type { FilaTarea } from '../db/sp.js';
import { aFechaHoraIso, aFechaONull } from '../mapeo/fecha.js';
import { aPersona, aRefNombre, type Persona, type RefNombre } from '../mapeo/valores.js';

export interface Tarea {
  id: number;
  nombre: string;
  estado: string;
  prioridad: number | null;
  tipo: RefNombre | null;
  ticketId: number | null;
  desarrollador: Persona | null;
  responsable: Persona | null;
  horasEstimadas: number | null;
  fechaCompromiso: string | null;
  creadaEn: string;
  descripcion?: string | null;
}

/** Fila de PROC_LIST_TAREAS_AG → tarea del contrato (misma forma en listar_tareas y en el contexto). */
export function mapearTarea(fila: FilaTarea, zona: string, incluirDescripcion: boolean): Tarea {
  const tarea: Tarea = {
    id: fila.COD_ASIGNACION_JK3,
    nombre: fila.NOMBRE.trim(),
    estado: fila.ESTADO_ASIGNACION.trim(),
    prioridad: fila.PRIORIDAD,
    tipo: aRefNombre(fila.COD_TIPO_ASIGNACION_JK3, fila.TIPO_ASIGNACION),
    ticketId: fila.COD_RECLAMO,
    desarrollador: aPersona(fila.COD_DESARROLLADOR, fila.DESARROLLADOR),
    responsable: aPersona(fila.COD_DESARROLLADOR_RESP, fila.DESARROLLADOR_RESP),
    horasEstimadas: fila.HORAS_ESTIMADAS,
    fechaCompromiso: aFechaONull(fila.FECHA_COMPROMISO),
    creadaEn: aFechaHoraIso(fila.FECHA_HORA_CREA, zona),
  };
  if (incluirDescripcion) tarea.descripcion = fila.DESCRIPCION?.trim() || null;
  return tarea;
}

/** "1 agenda" / "3 agendas". */
export function plural(cantidad: number, singular: string, pluralTexto = `${singular}s`): string {
  return `${cantidad} ${cantidad === 1 ? singular : pluralTexto}`;
}

/** "mostrando 21–40" para resúmenes de listados. */
export function rango(desplazamiento: number, cantidad: number): string {
  return cantidad === 0 ? 'ninguno en esta página' : `mostrando ${desplazamiento + 1}–${desplazamiento + cantidad}`;
}

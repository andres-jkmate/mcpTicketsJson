/**
 * Verificación de éxito por caso (spec "Verificación de éxito por caso", design D8). Las lecturas se
 * comparan contra la verdad de referencia tomada de la base; las escrituras se traducen de los
 * argumentos de cada versión a una forma común antes de verificarlas.
 */
import { LIMITE_IDS, normalizar, type Listado, type VerdadReferencia } from './base.js';
import type { Caso } from './casos.js';
import type { Version } from './configuracion.js';
import type { RegistroEscritura } from './interceptor.js';
import type { FinCorrida } from './loop.js';
import type { Verificacion } from './registro.js';

export const FALTAN_DATOS = 'faltan datos esperados';

/** Forma común de una escritura (D8). */
export interface EscrituraNormalizada {
  operacion: 'crear_tarea' | 'actualizar_ticket' | 'otra';
  ticketId: number | null;
  desarrolladorId: number | null;
  nombre: string | null;
  criterios: string[];
  prioridad: string | null;
  mensaje: string | null;
}

const entero = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) ? n : null;
};
const textoONull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/** En v1 los criterios van dentro de DESCRIPCION: cuenta si la descripción los menciona. */
export function criteriosEnDescripcionV1(descripcion: string | null): string[] {
  return descripcion && /CRITERIO|ACEPTACION/.test(normalizar(descripcion)) ? [descripcion] : [];
}

export function normalizarEscritura(version: Version, e: RegistroEscritura): EscrituraNormalizada {
  const a = e.argumentos;
  const vacia: EscrituraNormalizada = { operacion: 'otra', ticketId: null, desarrolladorId: null, nombre: null, criterios: [], prioridad: null, mensaje: null };
  if (version === 'v1') {
    if (e.tool === 'crear_tarea') {
      const descripcion = textoONull(a.DESCRIPCION);
      return { ...vacia, operacion: 'crear_tarea', ticketId: entero(a.NRO_TICKET), desarrolladorId: entero(a.COD_DESARROLLADOR), nombre: textoONull(a.NOMBRE), criterios: criteriosEnDescripcionV1(descripcion) };
    }
    if (e.tool === 'agregar_mensaje_ticket') {
      return { ...vacia, operacion: 'actualizar_ticket', ticketId: entero(a.P_COD_RECLAMO), prioridad: textoONull(a.P_NUEVA_PRIORIDAD)?.toUpperCase() ?? null, mensaje: textoONull(a.P_MENSAJE) };
    }
    return vacia;
  }
  if (e.tool === 'crear_tarea') {
    const descripcion = objeto(a.descripcion);
    const criterios = Array.isArray(descripcion.criteriosAceptacion) ? descripcion.criteriosAceptacion.filter((c): c is string => typeof c === 'string' && c.trim() !== '') : [];
    return {
      ...vacia,
      operacion: 'crear_tarea',
      ticketId: entero(a.ticketId),
      // El arnés ya resolvió "yo", { id } o { nombre } al interceptar.
      desarrolladorId: e.resueltos['asignacion.desarrollador'] ?? null,
      nombre: textoONull(objeto(a.tarea).nombre),
      criterios,
    };
  }
  if (e.tool === 'actualizar_ticket') {
    return { ...vacia, operacion: 'actualizar_ticket', ticketId: entero(a.ticketId), prioridad: textoONull(objeto(a.cambios).prioridad), mensaje: textoONull(objeto(a.mensaje).texto) };
  }
  return vacia;
}

/** "74.836" o "#74836" cuentan como 74836; 748360 no. */
export function mencionaNumero(texto: string, n: number): boolean {
  const sinSeparadores = texto.replace(/(\d)[.,](?=\d{3}(?!\d))/g, '$1');
  return new RegExp(`(?<!\\d)${n}(?!\\d)`).test(sinSeparadores);
}

function verificarListado(respuesta: string, esperado: Listado): Verificacion {
  const faltan = esperado.ids.filter((id) => !mencionaNumero(respuesta, id));
  if (!faltan.length) return { exito: true };
  if (esperado.total > LIMITE_IDS && mencionaNumero(respuesta, esperado.total)) return { exito: true };
  return { exito: false, motivo: `${FALTAN_DATOS}: no menciona ${faltan.length} de ${esperado.ids.length}` };
}

export interface EntradaVerificacion {
  caso: Caso;
  version: Version;
  referencia: VerdadReferencia;
  fin: FinCorrida;
  motivoFin?: string;
  respuestaFinal: string | null;
  escrituras: RegistroEscritura[];
}

export function verificar(e: EntradaVerificacion): Verificacion {
  if (e.fin !== 'end_turn') return { exito: false, motivo: `${e.fin}${e.motivoFin ? `: ${e.motivoFin}` : ''}` };
  const respuesta = e.respuestaFinal ?? '';
  const validas = e.escrituras.filter((w) => w.valida).map((w) => normalizarEscritura(e.version, w));

  switch (e.caso.id) {
    case 'estado-ticket': {
      const ref = e.referencia['estado-ticket']!;
      const faltan: string[] = [];
      if (!normalizar(respuesta).includes(normalizar(ref.estado))) faltan.push(`estado ${ref.estado}`);
      const tareas = ref.tareasAbiertas.filter((id) => !mencionaNumero(respuesta, id));
      if (tareas.length) faltan.push(`tareas ${tareas.join(', ')}`);
      return faltan.length ? { exito: false, motivo: `${FALTAN_DATOS}: ${faltan.join('; ')}` } : { exito: true };
    }
    case 'mis-tickets-agendados':
    case 'mis-tareas-pendientes':
      return verificarListado(respuesta, e.referencia[e.caso.id]!);
    case 'crear-tarea': {
      const ref = e.referencia['crear-tarea']!;
      const creaciones = validas.filter((w) => w.operacion === 'crear_tarea');
      if (creaciones.length !== 1) return { exito: false, motivo: `se esperaba una única creación de tarea y hubo ${creaciones.length}` };
      const t = creaciones[0]!;
      const problemas = [
        t.ticketId !== ref.ticketId && `ticket ${t.ticketId ?? '(ninguno)'} en lugar de ${ref.ticketId}`,
        t.desarrolladorId !== ref.desarrolladorId && `desarrollador ${t.desarrolladorId ?? '(ninguno)'} en lugar de ${ref.desarrolladorId}`,
        !t.nombre && 'nombre vacío',
        !t.criterios.length && 'sin criterios de aceptación',
      ].filter(Boolean);
      return problemas.length ? { exito: false, motivo: problemas.join('; ') } : { exito: true };
    }
    case 'prioridad-mensaje': {
      const ref = e.referencia['prioridad-mensaje']!;
      const otras = validas.filter((w) => w.operacion === 'actualizar_ticket' && w.ticketId !== ref.ticketId);
      if (otras.length) return { exito: false, motivo: `escritura sobre el ticket ${otras[0]!.ticketId} en lugar de ${ref.ticketId}` };
      const sobreTicket = validas.filter((w) => w.operacion === 'actualizar_ticket' && w.ticketId === ref.ticketId);
      // Puede ser una sola escritura o varias; cuenta la última prioridad indicada.
      const prioridad = sobreTicket.map((w) => w.prioridad).filter(Boolean).at(-1) ?? null;
      const mensaje = sobreTicket.some((w) => w.mensaje);
      const problemas = [prioridad !== ref.prioridad && `prioridad ${prioridad ?? '(sin cambio)'} en lugar de ${ref.prioridad}`, !mensaje && 'sin mensaje'].filter(Boolean);
      return problemas.length ? { exito: false, motivo: problemas.join('; ') } : { exito: true };
    }
  }
}

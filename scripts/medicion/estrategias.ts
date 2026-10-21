import type { CasoListado } from './conjunto.js';

/** Lo que el script mide de una llamada. Nunca se guarda el texto, solo sus tamaños. */
export interface RespuestaMedida {
  caracteresTexto: number;
  /** Caracteres de JSON.stringify(structuredContent); null si la respuesta no lo trae. */
  caracteresEstructurado: number | null;
  esError: boolean;
  /** Texto del content, solo para extraer datos que necesita la estrategia (no se reporta). */
  texto: string;
}

/** Invoca una tool en un servidor MCP. */
export type Llamador = (tool: string, argumentos: Record<string, unknown>) => Promise<RespuestaMedida>;

export interface MedicionVersion {
  llamadas: number;
  caracteresTexto: number;
  caracteresEstructurado: number | null;
  errores: number;
}

export interface MedicionCaso {
  tipo: 'contexto' | 'listado';
  caso: string;
  v1: MedicionVersion;
  v2: MedicionVersion;
}

function acumular(respuestas: RespuestaMedida[]): MedicionVersion {
  const conEstructurado = respuestas.filter((r) => r.caracteresEstructurado !== null);
  return {
    llamadas: respuestas.length,
    caracteresTexto: respuestas.reduce((s, r) => s + r.caracteresTexto, 0),
    caracteresEstructurado: conEstructurado.length
      ? conEstructurado.reduce((s, r) => s + (r.caracteresEstructurado ?? 0), 0)
      : null,
    errores: respuestas.filter((r) => r.esError).length,
  };
}

/** Busca FECHA_CREACION en la salida de detalle_ticket de la v1 ('AAAA-MM-DD...'). */
export function fechaCreacionV1(textoDetalle: string): string | null {
  const m = /"FECHA_CREACION"\s*:\s*"(\d{4}-\d{2}-\d{2})/.exec(textoDetalle);
  return m?.[1] ?? null;
}

/**
 * Estrategia v1 para armar el contexto de un ticket (design D9): detalle, historial, agendas,
 * presupuestos y tareas por responsable desde la creación del ticket. La v1 no filtra tareas por
 * ticket: el agente recibe todas y filtra por NRO_TICKET, así que se cuentan todos los caracteres.
 */
export async function contextoV1(llamar: Llamador, ticketId: number, hoy: string): Promise<MedicionVersion> {
  const id = { P_COD_RECLAMO: ticketId };
  const detalle = await llamar('detalle_ticket', id);
  const [historial, agendas, presupuestos] = await Promise.all([
    llamar('historial_ticket', id),
    llamar('agendas_ticket', id),
    llamar('presupuestos_ticket', id),
  ]);
  const desde = fechaCreacionV1(detalle.texto);
  const tareas = await llamar('listar_tareas_responsable', {
    ...(desde ? { FECHA_DESDE: `${desde} 00:00` } : {}),
    FECHA_HASTA: `${hoy} 23:59`,
  });
  return acumular([detalle, historial, agendas, presupuestos, tareas]);
}

export async function contextoV2(llamar: Llamador, ticketId: number): Promise<MedicionVersion> {
  return acumular([await llamar('obtener_contexto_ticket', { ticketId })]);
}

export async function medirContexto(v1: Llamador, v2: Llamador, ticketId: number, hoy: string): Promise<MedicionCaso> {
  return { tipo: 'contexto', caso: `contexto #${ticketId}`, v1: await contextoV1(v1, ticketId, hoy), v2: await contextoV2(v2, ticketId) };
}

export async function medirListado(v1: Llamador, v2: Llamador, caso: CasoListado): Promise<MedicionCaso> {
  return {
    tipo: 'listado',
    caso: caso.nombre,
    v1: acumular([await v1(caso.v1.tool, caso.v1.argumentos)]),
    v2: acumular([await v2(caso.v2.tool, caso.v2.argumentos)]),
  };
}

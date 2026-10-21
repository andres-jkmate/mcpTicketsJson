import { z } from 'zod';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { EsquemaJson } from './definicion.js';

/** Valores de dominio (design D4). Los tests de integración los comparan contra la base. */
export const ESTADOS_TICKET = [
  'INICIADO',
  'INICIADO Y EN TRÁMITE',
  'EN TRÁMITE',
  'AGENDADO',
  'A PRESUPUESTAR',
  'PENDIENTE',
  'PRESUPUESTO APROBADO',
  'FINALIZADO',
  'CANCELADO',
] as const;
export const PRIORIDADES_TICKET = ['SIN ASIGNAR', 'BAJA', 'MEDIA', 'ALTA', 'URGENTE', 'CRITICA'] as const;
export const SISTEMAS = ['JK3', 'JK2', 'DESKTOP', 'CRM'] as const;
export const ESTADOS_TAREA = ['POR INICIAR', 'INICIADA', 'REABIERTO', 'FINALIZA DESARROLLO', 'FINALIZADA', 'ARCHIVADO'] as const;
export const ESTADOS_PRESUPUESTO = ['PENDIENTE', 'APROBADO', 'RECHAZADO'] as const;
export const TIPOS_HITO = ['MENSAJE', 'ASIGNACION', 'CAMBIO_ESTADO', 'CAMBIO_PRIORIDAD', 'CAMBIO_TIPO_SISTEMA'] as const;

/** Todas las tools de este change son de lectura. */
export const ANOTACIONES_LECTURA: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const nullable = (esquema: EsquemaJson): EsquemaJson => ({ anyOf: [esquema, { type: 'null' }] });
export const ref = (nombre: string): EsquemaJson => ({ $ref: `#/$defs/${nombre}` });
export const refNullable = (nombre: string): EsquemaJson => nullable(ref(nombre));

/** `$defs` compartidas por todas las tools (design D4). */
export const DEFS: Record<string, EsquemaJson> = {
  persona: {
    type: 'object',
    properties: { id: { type: 'integer' }, nombre: { type: 'string' } },
    required: ['id', 'nombre'],
  },
  refNombre: {
    type: 'object',
    properties: { id: { type: 'integer' }, nombre: { type: 'string' } },
    required: ['id', 'nombre'],
  },
  fechaHora: { type: 'string', format: 'date-time' },
  fecha: { type: 'string', format: 'date' },
  estadoTicket: { enum: [...ESTADOS_TICKET] },
  prioridadTicket: { enum: [...PRIORIDADES_TICKET] },
  sistema: { enum: [...SISTEMAS, null] },
  estadoTarea: { enum: [...ESTADOS_TAREA] },
  estadoPresupuesto: { enum: [...ESTADOS_PRESUPUESTO] },
  tarea: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      nombre: { type: 'string' },
      estado: ref('estadoTarea'),
      prioridad: { type: ['integer', 'null'] },
      tipo: refNullable('refNombre'),
      ticketId: { type: ['integer', 'null'] },
      desarrollador: refNullable('persona'),
      responsable: refNullable('persona'),
      horasEstimadas: { type: ['integer', 'null'] },
      fechaCompromiso: refNullable('fecha'),
      creadaEn: ref('fechaHora'),
      descripcion: { type: ['string', 'null'] },
    },
    required: [
      'id',
      'nombre',
      'estado',
      'prioridad',
      'tipo',
      'ticketId',
      'desarrollador',
      'responsable',
      'horasEstimadas',
      'fechaCompromiso',
      'creadaEn',
    ],
  },
};

/** Agrega las `$defs` compartidas en la raíz de un schema. */
export function conDefs(esquema: EsquemaJson): EsquemaJson {
  return { ...esquema, $defs: { ...DEFS, ...((esquema.$defs as Record<string, EsquemaJson> | undefined) ?? {}) } };
}

// ---------------------------------------------------------------- piezas de input (JSON + zod)

export const LIMITE_LISTADO_JSON = { type: 'integer', minimum: 1, maximum: 100, default: 20 };
export const DESPLAZAMIENTO_JSON = { type: 'integer', minimum: 0, default: 0 };
export const limiteZod = z.number().int().min(1).max(100).default(20);
export const desplazamientoZod = z.number().int().min(0).default(0);

/** Un id de persona o "yo" (se resuelve desde la sesión). */
export const personaOYoJson = (descripcion: string): EsquemaJson => ({
  anyOf: [{ type: 'integer' }, { const: 'yo' }],
  description: descripcion,
});
export const personaOYoZod = z.union([z.number().int().positive(), z.literal('yo')]);

export const fechaZod = z.iso.date();

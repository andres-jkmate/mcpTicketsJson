import { z } from 'zod';
import type { Sesion } from '../auth/sesion.js';
import type { FiltrosTickets } from '../db/sp.js';
import type { EsquemaJson } from './definicion.js';
import { ESTADOS_TICKET, fechaZod, personaOYoJson, personaOYoZod, PRIORIDADES_TICKET, ref, SISTEMAS } from './esquemas.js';

/** Filtros compartidos por listar_tickets y resumir_tickets (design D5 y D7). */
export const FILTROS_TICKETS_JSON: Record<string, EsquemaJson> = {
  estados: {
    type: 'array',
    items: ref('estadoTicket'),
    minItems: 1,
    uniqueItems: true,
    description: 'OR entre valores. Si se indica, se ignora soloAbiertos',
  },
  soloAbiertos: {
    type: 'boolean',
    default: true,
    description: 'Solo tickets en estados no finalizados (excluye FINALIZADO y CANCELADO)',
  },
  prioridades: { type: 'array', items: ref('prioridadTicket'), minItems: 1, uniqueItems: true },
  sistema: { enum: [...SISTEMAS] },
  asignadoA: personaOYoJson('Usuario asignado (código de usuario) o "yo"'),
  agendadoA: personaOYoJson('Usuario con alguna agenda en el ticket (código de usuario) o "yo"'),
  clienteId: { type: 'integer' },
  creadoDesde: { ...ref('fecha'), description: 'AAAA-MM-DD, inclusive' },
  creadoHasta: { ...ref('fecha'), description: 'AAAA-MM-DD, inclusive' },
  texto: {
    type: 'string',
    minLength: 3,
    maxLength: 100,
    description: 'Busca en título y pedido normalizado, sin distinguir mayúsculas ni acentos',
  },
  buscarEnMensajes: {
    type: 'boolean',
    default: false,
    description: "Extiende 'texto' a los mensajes del historial (más lento)",
  },
};

const sinRepetidos = <T>(valores: T[]) => new Set(valores).size === valores.length;

export const filtrosTicketsZod = {
  estados: z.array(z.enum(ESTADOS_TICKET)).min(1).refine(sinRepetidos, 'Hay estados repetidos').optional(),
  soloAbiertos: z.boolean().default(true),
  prioridades: z.array(z.enum(PRIORIDADES_TICKET)).min(1).refine(sinRepetidos, 'Hay prioridades repetidas').optional(),
  sistema: z.enum(SISTEMAS).optional(),
  asignadoA: personaOYoZod.optional(),
  agendadoA: personaOYoZod.optional(),
  clienteId: z.number().int().positive().optional(),
  creadoDesde: fechaZod.optional(),
  creadoHasta: fechaZod.optional(),
  texto: z
    .string()
    .trim()
    .min(3, 'El texto de búsqueda debe tener al menos 3 caracteres')
    .max(100)
    .optional(),
  buscarEnMensajes: z.boolean().default(false),
};

type ValoresFiltros = z.output<z.ZodObject<typeof filtrosTicketsZod>>;

/** Valida que el rango de fechas no esté invertido (las fechas ISO se comparan como texto). */
export function rangoValido(f: { creadoDesde?: string; creadoHasta?: string }): boolean {
  return !f.creadoDesde || !f.creadoHasta || f.creadoDesde <= f.creadoHasta;
}
export const MENSAJE_RANGO = 'creadoDesde es posterior a creadoHasta';

/** Traduce los filtros de la tool a los parámetros de los SP, resolviendo "yo" desde la sesión. */
export function aFiltrosSp(f: ValoresFiltros, sesion: Sesion): FiltrosTickets {
  const persona = (valor: number | 'yo' | undefined) => (valor === 'yo' ? sesion.codUsuario : valor);
  return {
    ...(f.estados ? { estados: f.estados } : {}),
    soloAbiertos: f.soloAbiertos,
    ...(f.prioridades ? { prioridades: f.prioridades } : {}),
    ...(f.sistema ? { sistema: f.sistema } : {}),
    ...(f.asignadoA !== undefined ? { codUsuarioAsignado: persona(f.asignadoA) } : {}),
    ...(f.agendadoA !== undefined ? { agendadoA: persona(f.agendadoA) } : {}),
    ...(f.clienteId !== undefined ? { codCliente: f.clienteId } : {}),
    ...(f.creadoDesde ? { creadoDesde: f.creadoDesde } : {}),
    ...(f.creadoHasta ? { creadoHasta: f.creadoHasta } : {}),
    ...(f.texto ? { texto: f.texto } : {}),
    buscarEnMensajes: f.buscarEnMensajes,
  };
}

/** "abiertos" cuando aplica el filtro por defecto, para el resumen en texto. */
export function sufijoAbiertos(f: { estados?: readonly string[]; soloAbiertos: boolean }): string {
  return !f.estados && f.soloAbiertos ? ' abiertos' : '';
}

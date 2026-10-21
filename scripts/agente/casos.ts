/**
 * Conjunto fijo de casos del arnés (spec "Conjunto fijo de casos", design D8):
 * medicion/agente/casos.json. Cada caso obligatorio tiene un id fijo que elige su verificador.
 */
import { z } from 'zod';

export const REPETICIONES_POR_DEFECTO = 5;
export const MAX_TURNOS_POR_DEFECTO = 25;

const comun = {
  pedido: z.string().min(1),
  /** Criterio de éxito en palabras; el verificador del id lo implementa (D8). */
  criterio: z.string().min(1),
};

const estadoTicket = z.object({ id: z.literal('estado-ticket'), tipo: z.literal('lectura'), ticketId: z.number().int().positive(), ...comun });
const misTicketsAgendados = z.object({ id: z.literal('mis-tickets-agendados'), tipo: z.literal('lectura'), ...comun });
const misTareasPendientes = z.object({ id: z.literal('mis-tareas-pendientes'), tipo: z.literal('lectura'), ...comun });
const crearTarea = z.object({
  id: z.literal('crear-tarea'),
  tipo: z.literal('escritura'),
  ticketId: z.number().int().positive(),
  /** Desarrollador nombrado en el pedido, tal como lo diría una persona (D8). */
  desarrollador: z.object({ id: z.number().int().positive(), nombre: z.string().min(1) }),
  ...comun,
});
const prioridadMensaje = z.object({
  id: z.literal('prioridad-mensaje'),
  tipo: z.literal('escritura'),
  ticketId: z.number().int().positive(),
  prioridad: z.literal('ALTA'),
  ...comun,
});

const caso = z.discriminatedUnion('id', [estadoTicket, misTicketsAgendados, misTareasPendientes, crearTarea, prioridadMensaje]);

export const CASOS_OBLIGATORIOS = ['estado-ticket', 'mis-tickets-agendados', 'mis-tareas-pendientes', 'crear-tarea', 'prioridad-mensaje'] as const;

const esquemaCasos = z
  .object({
    descripcion: z.string().optional(),
    repeticiones: z.number().int().min(1).default(REPETICIONES_POR_DEFECTO),
    maxTurnos: z.number().int().min(1).default(MAX_TURNOS_POR_DEFECTO),
    casos: z.array(caso),
  })
  .superRefine((c, ctx) => {
    const ids = c.casos.map((x) => x.id);
    const faltan = CASOS_OBLIGATORIOS.filter((id) => !ids.includes(id));
    if (faltan.length) ctx.addIssue({ code: 'custom', path: ['casos'], message: `Faltan casos obligatorios: ${faltan.join(', ')}` });
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['casos'], message: 'Hay casos repetidos' });
  });

export type ConjuntoCasos = z.infer<typeof esquemaCasos>;
export type Caso = ConjuntoCasos['casos'][number];
export type IdCaso = Caso['id'];

/** Valida el contenido de medicion/agente/casos.json. Lanza un Error legible si no cumple. */
export function cargarCasos(json: unknown): ConjuntoCasos {
  const r = esquemaCasos.safeParse(json);
  if (!r.success) {
    throw new Error(`medicion/agente/casos.json inválido: ${r.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`).join('; ')}`);
  }
  return r.data;
}

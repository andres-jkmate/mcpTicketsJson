import { z } from 'zod';

/** Ticket que el experimento exige medir siempre (proposal y design D9). */
export const TICKET_OBLIGATORIO = 74836;

const llamada = z.object({
  tool: z.string().min(1),
  argumentos: z.record(z.string(), z.unknown()).default({}),
});

const esquemaConjunto = z.object({
  descripcion: z.string().optional(),
  tickets: z
    .array(z.number().int().positive())
    .min(1)
    .refine((t) => new Set(t).size === t.length, 'Hay tickets repetidos')
    .refine((t) => t.includes(TICKET_OBLIGATORIO), `El conjunto debe incluir el ticket ${TICKET_OBLIGATORIO}`),
  listados: z.array(z.object({ nombre: z.string().min(1), v1: llamada, v2: llamada })).default([]),
});

export type Conjunto = z.infer<typeof esquemaConjunto>;
export type CasoListado = Conjunto['listados'][number];

/** Valida el contenido de medicion/tickets.json. Lanza un Error legible si no cumple. */
export function cargarConjunto(json: unknown): Conjunto {
  const r = esquemaConjunto.safeParse(json);
  if (!r.success) {
    throw new Error(`medicion/tickets.json inválido: ${r.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`).join('; ')}`);
  }
  return r.data;
}

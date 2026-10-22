/**
 * Carga y validación de la configuración versionada del arnés (design D6 y D10):
 * medicion/agente/precios.json y medicion/agente/tools.json.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { RAIZ } from './conexion.js';

export const CARPETA_AGENTE = join(RAIZ, 'medicion', 'agente');

export type Version = 'v1' | 'v2';
export const VERSIONES: readonly Version[] = ['v1', 'v2'];

export function validar<T>(esquema: z.ZodType<T>, json: unknown, archivo: string): T {
  const r = esquema.safeParse(json);
  if (!r.success) {
    throw new Error(`${archivo} inválido: ${r.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`).join('; ')}`);
  }
  return r.data;
}

export async function leerJson(archivo: string): Promise<unknown> {
  return JSON.parse(await readFile(join(CARPETA_AGENTE, archivo), 'utf8'));
}

// ---------------------------------------------------------------- precios

const precio = z.number().nonnegative();
const esquemaPrecios = z.object({
  descripcion: z.string().optional(),
  fuente: z.string().optional(),
  verificadoEl: z.string().optional(),
  modelos: z.record(z.string(), z.object({ entrada: precio, salida: precio, lecturaCache: precio, escrituraCache: precio }).strict()),
});

export type Precios = z.infer<typeof esquemaPrecios>;
export type PrecioModelo = Precios['modelos'][string];

export function cargarPrecios(json: unknown): Precios {
  return validar(esquemaPrecios, json, 'medicion/agente/precios.json');
}

/** Precio por MTok de un modelo. Falla si el modelo no tiene precio: nunca se asume cero. */
export function precioDe(precios: Precios, modelo: string): PrecioModelo {
  const p = precios.modelos[modelo];
  if (!p) throw new Error(`medicion/agente/precios.json no tiene precio para el modelo ${modelo}`);
  return p;
}

// ---------------------------------------------------------------- listas de tools

const lista = z.array(z.string().min(1)).refine((l) => new Set(l).size === l.length, 'Hay tools repetidas');
const listasVersion = z
  .object({ lectura: lista, escritura: lista })
  .superRefine((v, ctx) => {
    const ambas = v.lectura.filter((t) => v.escritura.includes(t));
    if (ambas.length) ctx.addIssue({ code: 'custom', message: `Tools en lectura y escritura a la vez: ${ambas.join(', ')}` });
  });
const esquemaTools = z.object({ descripcion: z.string().optional(), v1: listasVersion, v2: listasVersion });

export type ListasTools = z.infer<typeof esquemaTools>;

export function cargarListasTools(json: unknown): ListasTools {
  return validar(esquemaTools, json, 'medicion/agente/tools.json');
}

/** Solo se reenvía lo que está en la lista de lectura; lo desconocido se intercepta (D6). */
export function esLectura(listas: ListasTools, version: Version, tool: string): boolean {
  return listas[version].lectura.includes(tool);
}

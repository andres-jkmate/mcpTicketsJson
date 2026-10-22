/**
 * Guiones y supuestos del estimador sin API (design D12): medicion/agente/guiones.json y
 * medicion/agente/estimacion.json.
 */
import { z } from 'zod';
import { CASOS_OBLIGATORIOS, type IdCaso } from './casos.js';
import { validar, VERSIONES, type ListasTools, type Version } from './configuracion.js';

// ---------------------------------------------------------------- guiones.json

const llamada = z.object({ tool: z.string().min(1), argumentos: z.record(z.string(), z.unknown()) }).strict();
/** Turnos con llamadas (en paralelo dentro de cada turno). El turno de la respuesta final es implícito. */
const guion = z.array(z.array(llamada).min(1));
const porVersion = z.object({ v1: guion, v2: guion }).strict();
const esquemaGuiones = z.object({
  descripcion: z.string().optional(),
  guiones: z.record(z.string(), porVersion),
});

export type LlamadaGuion = z.infer<typeof llamada>;
export type Guion = z.infer<typeof guion>;
export type Guiones = Record<IdCaso, Record<Version, Guion>>;

/**
 * Valida guiones.json: tienen que estar los 5 casos obligatorios, cada uno con las dos versiones,
 * y cada llamada tiene que usar una tool que publica esa versión (según tools.json).
 */
export function cargarGuiones(json: unknown, listas: ListasTools): Guiones {
  const archivo = 'medicion/agente/guiones.json';
  const { guiones } = validar(esquemaGuiones, json, archivo);
  const problemas: string[] = [];
  const faltan = CASOS_OBLIGATORIOS.filter((id) => !(id in guiones));
  if (faltan.length) problemas.push(`faltan guiones de los casos ${faltan.join(', ')}`);
  const sobran = Object.keys(guiones).filter((id) => !(CASOS_OBLIGATORIOS as readonly string[]).includes(id));
  if (sobran.length) problemas.push(`casos desconocidos: ${sobran.join(', ')}`);
  for (const [caso, versiones] of Object.entries(guiones)) {
    for (const version of VERSIONES) {
      const publicadas = [...listas[version].lectura, ...listas[version].escritura];
      for (const [i, turno] of versiones[version].entries()) {
        for (const l of turno) {
          if (!publicadas.includes(l.tool)) problemas.push(`${caso}.${version} turno ${i + 1}: la ${version} no publica la tool ${l.tool}`);
        }
      }
    }
  }
  if (problemas.length) throw new Error(`${archivo} inválido: ${problemas.join('; ')}`);
  return guiones as Guiones;
}

/** Reemplaza "{hoy}" en los textos de los argumentos. */
export function rellenarArgumentos(valor: unknown, hoy: string): unknown {
  if (typeof valor === 'string') return valor.replaceAll('{hoy}', hoy);
  if (Array.isArray(valor)) return valor.map((v) => rellenarArgumentos(v, hoy));
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, rellenarArgumentos(v, hoy)]));
  return valor;
}

// ---------------------------------------------------------------- estimacion.json

const tokens = z.number().nonnegative();
const esquemaEstimacion = z
  .object({
    descripcion: z.string().optional(),
    /** Caracteres por token para convertir los textos medidos. */
    razonCaracteresPorToken: z.number().positive(),
    /** Tokens de salida supuestos por turno para el thinking (no vuelve al historial). */
    thinkingPorTurno: tokens,
    /** Tokens de salida supuestos para la respuesta final, en el último turno. */
    respuestaFinal: tokens,
    /** Tokens del prompt de tool use que agrega la API, iguales para las dos versiones. */
    promptToolUse: tokens,
  })
  .strict();

export type SupuestosEstimacion = z.infer<typeof esquemaEstimacion>;

export function cargarEstimacion(json: unknown): SupuestosEstimacion {
  return validar(esquemaEstimacion, json, 'medicion/agente/estimacion.json');
}

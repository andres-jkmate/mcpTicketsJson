/**
 * Validación con JSON Schema (ajv) de los argumentos de escritura que arma el agente (design D6),
 * y carga de los schemas de escritura de la v2 (design D7).
 */
import { createRequire } from 'node:module';
import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import { z } from 'zod';

// ajv-formats es CommonJS con export default: con NodeNext se toma por require.
const agregarFormatos = createRequire(import.meta.url)('ajv-formats') as (ajv: Ajv) => Ajv;

export interface ErrorCampo {
  campo: string;
  mensaje: string;
}

export interface ResultadoValidacion {
  valido: boolean;
  errores: ErrorCampo[];
}

/** Ruta legible: /descripcion/criteriosAceptacion → descripcion.criteriosAceptacion. */
function campoDe(e: ErrorObject): string {
  const partes = e.instancePath.split('/').filter(Boolean);
  if (e.keyword === 'required') partes.push(String((e.params as { missingProperty: string }).missingProperty));
  if (e.keyword === 'additionalProperties') partes.push(String((e.params as { additionalProperty: string }).additionalProperty));
  return partes.join('.') || '(raíz)';
}

export class Validador {
  // strict: false porque también se validan los schemas publicados por la v1, que no controlamos.
  private readonly ajv = agregarFormatos(new Ajv({ allErrors: true, strict: false }));
  private readonly compilados = new WeakMap<object, ValidateFunction>();

  validar(schema: object, argumentos: unknown): ResultadoValidacion {
    let validar = this.compilados.get(schema);
    if (!validar) {
      validar = this.ajv.compile(schema);
      this.compilados.set(schema, validar);
    }
    if (validar(argumentos)) return { valido: true, errores: [] };
    const errores = (validar.errors ?? []).map((e) => ({ campo: campoDe(e), mensaje: e.message ?? e.keyword }));
    // Sin duplicados (anyOf repite errores de cada rama).
    const unicos = new Map(errores.map((e) => [`${e.campo}|${e.mensaje}`, e]));
    return { valido: false, errores: [...unicos.values()] };
  }
}

// ---------------------------------------------------------------- escritura-v2.json

const esquemaEscrituraV2 = z.object({
  descripcion: z.string().optional(),
  tools: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().min(1),
        input_schema: z.object({ type: z.literal('object') }).passthrough(),
      }),
    )
    .min(1),
});

export type ToolEscrituraV2 = z.infer<typeof esquemaEscrituraV2>['tools'][number];

export function cargarEscrituraV2(json: unknown): ToolEscrituraV2[] {
  const r = esquemaEscrituraV2.safeParse(json);
  if (!r.success) {
    throw new Error(`medicion/agente/escritura-v2.json inválido: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return r.data.tools;
}

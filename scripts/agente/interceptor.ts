/**
 * Interceptor de tools (design D6): reenvía las de lectura al servidor y nunca las de escritura.
 * Una escritura se registra tal como la armó el agente, se valida con JSON Schema (ajv) y con las
 * mismas verificaciones referenciales mínimas en las dos versiones, y se responde desde una plantilla
 * de respuesta real con ids ficticios.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ConsultasReferenciales } from './base.js';
import { CARPETA_AGENTE, esLectura, type ListasTools, type Version } from './configuracion.js';
import type { ErrorCampo, Validador } from './validacion.js';

/** Resultado de tools/call en la forma de MCP (solo lo que el arnés usa). */
export interface ResultadoTool {
  content: { type: string; text?: string }[];
  structuredContent?: unknown;
  isError?: boolean;
}

export interface Plantilla {
  /** En v2, resumen que va como primer bloque de content. */
  resumen?: string;
  structuredContent: unknown;
}

/** Respuesta genérica de la v1 para escrituras sin plantilla real (design, "Filas creadas"). */
export const PLANTILLA_GENERICA_V1: Plantilla = { structuredContent: { resultado: [{ RESULTADO: 1, MENSAJE: '' }] } };
const PLANTILLA_GENERICA_V2: Plantilla = { resumen: 'Operación realizada.', structuredContent: { id: '{id}' } };

/** Escritura tal como la armó el agente, con lo que el arnés resolvió y el resultado de validarla. */
export interface RegistroEscritura {
  tool: string;
  argumentos: Record<string, unknown>;
  valida: boolean;
  errores: ErrorCampo[];
  /** Ids de personas resueltos por el arnés (personaRef "yo" o { nombre } en v2). */
  resueltos: Record<string, number>;
  /** true si respondió con la plantilla genérica por no tener una real. */
  plantillaGenerica: boolean;
}

export interface EjecucionTool {
  resultado: ResultadoTool;
  interceptada: boolean;
  /** Error de parámetros: schema inválido o referencia inexistente/ambigua. */
  errorParametro: boolean;
  escritura?: RegistroEscritura;
}

export interface OpcionesInterceptor {
  version: Version;
  listas: ListasTools;
  /** input_schema de cada tool que ve el modelo, por nombre. */
  schemas: Map<string, object>;
  plantillas: Map<string, Plantilla>;
  consultas: ConsultasReferenciales;
  validador: Validador;
  codDesarrollador: number;
  /** Invoca la tool en el servidor real. Solo se usa para tools de lectura. */
  reenviar: (tool: string, argumentos: Record<string, unknown>) => Promise<ResultadoTool>;
  /** Primer id ficticio; crece de a 1 con cada escritura válida. */
  primerIdFicticio?: number;
}

class ErrorReferencia extends Error {
  constructor(
    readonly codigo: 'PARAMETRO_INVALIDO' | 'NO_ENCONTRADO' | 'TICKET_NO_ENCONTRADO',
    mensaje: string,
    readonly detalle?: unknown,
  ) {
    super(mensaje);
  }
}

const texto = (t: string) => ({ type: 'text', text: t });

/** Reemplaza "{id}" y "{ticketId}" (valores exactos y dentro de textos). */
function rellenar(valor: unknown, marcadores: Record<string, number | null>): unknown {
  if (typeof valor === 'string') {
    const exacto = /^\{(\w+)\}$/.exec(valor);
    if (exacto && exacto[1]! in marcadores) return marcadores[exacto[1]!];
    return valor.replace(/\{(\w+)\}/g, (m, k: string) => (k in marcadores ? String(marcadores[k]) : m));
  }
  if (Array.isArray(valor)) return valor.map((v) => rellenar(v, marcadores));
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, rellenar(v, marcadores)]));
  return valor;
}

/** Arma el resultado como lo haría cada versión: v1 = JSON en content; v2 = resumen + JSON. */
export function resultadoDesdePlantilla(version: Version, plantilla: Plantilla, marcadores: Record<string, number | null>): ResultadoTool {
  const estructurado = rellenar(plantilla.structuredContent, marcadores);
  const json = JSON.stringify(estructurado);
  const content = version === 'v2' ? [texto(String(rellenar(plantilla.resumen ?? 'Operación realizada.', marcadores))), texto(json)] : [texto(json)];
  return { content, structuredContent: estructurado };
}

/**
 * Error de una escritura interceptada. v2: forma uniforme del contrato, con el detalle también en
 * content para que el modelo vea qué campo falló. v1: la forma RESULTADO/MENSAJE de sus SP.
 */
export function resultadoErrorEscritura(version: Version, codigo: string, mensaje: string, detalle?: unknown): ResultadoTool {
  if (version === 'v2') {
    const error = { codigo, mensaje, ...(detalle !== undefined ? { detalle } : {}) };
    return { isError: true, content: [texto(`${codigo}: ${mensaje}`), texto(JSON.stringify({ error }))], structuredContent: { error } };
  }
  const motivo = detalle !== undefined ? `${mensaje}: ${JSON.stringify(detalle)}` : mensaje;
  const estructurado = { resultado: [{ RESULTADO: 0, MENSAJE: motivo }] };
  return { isError: true, content: [texto(JSON.stringify(estructurado))], structuredContent: estructurado };
}

const entero = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) ? n : null;
};

export class Interceptor {
  private siguienteId: number;
  readonly escrituras: RegistroEscritura[] = [];

  constructor(private readonly o: OpcionesInterceptor) {
    this.siguienteId = o.primerIdFicticio ?? 900_001;
  }

  async ejecutar(tool: string, argumentos: Record<string, unknown>): Promise<EjecucionTool> {
    if (esLectura(this.o.listas, this.o.version, tool)) {
      return { resultado: await this.o.reenviar(tool, argumentos), interceptada: false, errorParametro: false };
    }
    return this.interceptar(tool, argumentos);
  }

  private async interceptar(tool: string, argumentos: Record<string, unknown>): Promise<EjecucionTool> {
    const { version } = this.o;
    const registro: RegistroEscritura = { tool, argumentos, valida: false, errores: [], resueltos: {}, plantillaGenerica: false };
    this.escrituras.push(registro);

    const schema = this.o.schemas.get(tool);
    if (schema) {
      const v = this.o.validador.validar(schema, argumentos);
      if (!v.valido) {
        registro.errores = v.errores;
        return { resultado: resultadoErrorEscritura(version, 'PARAMETRO_INVALIDO', 'Parámetros inválidos', v.errores), interceptada: true, errorParametro: true, escritura: registro };
      }
    }

    let ticketId: number | null;
    try {
      ticketId = version === 'v1' ? await this.referenciasV1(tool, argumentos, registro) : await this.referenciasV2(tool, argumentos, registro);
    } catch (error) {
      if (!(error instanceof ErrorReferencia)) throw error;
      registro.errores = [{ campo: '(referencia)', mensaje: error.message }];
      return { resultado: resultadoErrorEscritura(version, error.codigo, error.message, error.detalle), interceptada: true, errorParametro: true, escritura: registro };
    }

    registro.valida = true;
    const plantilla = this.o.plantillas.get(tool);
    registro.plantillaGenerica = !plantilla;
    const resultado = resultadoDesdePlantilla(version, plantilla ?? (version === 'v1' ? PLANTILLA_GENERICA_V1 : PLANTILLA_GENERICA_V2), {
      id: this.siguienteId++,
      ticketId,
    });
    return { resultado, interceptada: true, errorParametro: false, escritura: registro };
  }

  private async ticketExistente(id: number | null, campo: string): Promise<number | null> {
    if (id === null) return null;
    if (!(await this.o.consultas.existeTicket(id))) throw new ErrorReferencia('TICKET_NO_ENCONTRADO', `El ticket ${id} no existe (${campo})`);
    return id;
  }

  private async desarrolladorExistente(id: number, campo: string): Promise<number> {
    if (!(await this.o.consultas.existeDesarrollador(id))) throw new ErrorReferencia('NO_ENCONTRADO', `El desarrollador ${id} no existe (${campo})`);
    return id;
  }

  /** Verificaciones mínimas de la v1: ticket y desarrolladores existentes. Devuelve el ticket. */
  private async referenciasV1(tool: string, a: Record<string, unknown>, registro: RegistroEscritura): Promise<number | null> {
    for (const campo of ['COD_DESARROLLADOR', 'COD_DESARROLLADOR_RESP']) {
      const id = entero(a[campo]);
      if (id !== null) registro.resueltos[campo] = await this.desarrolladorExistente(id, campo);
    }
    const campoTicket = tool === 'crear_tarea' ? 'NRO_TICKET' : 'P_COD_RECLAMO';
    return this.ticketExistente(entero(a[campoTicket]), campoTicket);
  }

  /** v2: resuelve los personaRef ("yo", { id }, { nombre }) y verifica el ticket. */
  private async referenciasV2(tool: string, a: Record<string, unknown>, registro: RegistroEscritura): Promise<number | null> {
    const personas: [string, unknown][] =
      tool === 'crear_tarea'
        ? [
            ['asignacion.desarrollador', (a.asignacion as Record<string, unknown> | undefined)?.desarrollador],
            ['asignacion.responsable', (a.asignacion as Record<string, unknown> | undefined)?.responsable],
          ]
        : [['cambios.asignadoA', (a.cambios as Record<string, unknown> | undefined)?.asignadoA]];
    for (const [campo, ref] of personas) {
      if (ref !== undefined) registro.resueltos[campo] = await this.resolverPersona(ref, campo);
    }
    return this.ticketExistente(entero(a.ticketId), 'ticketId');
  }

  private async resolverPersona(ref: unknown, campo: string): Promise<number> {
    if (ref === 'yo') return this.o.codDesarrollador;
    const r = ref as { id?: number; nombre?: string };
    if (r.id !== undefined) return this.desarrolladorExistente(r.id, campo);
    const nombre = r.nombre ?? '';
    const encontrados = await this.o.consultas.buscarDesarrolladores(nombre);
    if (encontrados.length === 1) return encontrados[0]!.id;
    if (encontrados.length === 0) throw new ErrorReferencia('NO_ENCONTRADO', `No hay ningún desarrollador que coincida con "${nombre}" (${campo})`);
    throw new ErrorReferencia('PARAMETRO_INVALIDO', `"${nombre}" coincide con varios desarrolladores (${campo}); indicá uno por id`, {
      candidatos: encontrados.map((d) => ({ id: d.id, nombre: d.nombresUsuario[0] ?? d.nombre })),
    });
  }
}

/** Carga las plantillas de medicion/agente/plantillas/ de una versión ({version}-{tool}.json). */
export async function cargarPlantillas(version: Version, tools: string[]): Promise<Map<string, Plantilla>> {
  const plantillas = new Map<string, Plantilla>();
  for (const tool of tools) {
    try {
      const json = JSON.parse(await readFile(join(CARPETA_AGENTE, 'plantillas', `${version}-${tool}.json`), 'utf8')) as Plantilla;
      plantillas.set(tool, { resumen: json.resumen, structuredContent: json.structuredContent });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return plantillas;
}

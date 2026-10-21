import { z } from 'zod';
import type { Sesion } from '../auth/sesion.js';
import { listarTareas, type FiltrosTareas } from '../db/sp.js';
import { ErrorTool } from '../errores.js';
import type { DefinicionTool } from './definicion.js';
import {
  ANOTACIONES_LECTURA,
  conDefs,
  DESPLAZAMIENTO_JSON,
  desplazamientoZod,
  ESTADOS_TAREA,
  fechaZod,
  LIMITE_LISTADO_JSON,
  limiteZod,
  personaOYoJson,
  personaOYoZod,
  ref,
} from './esquemas.js';
import type { DependenciasTools } from './index.js';
import { mapearTarea, plural, rango, type Tarea } from './mapeo-comun.js';

const LARGO_NOMBRE_RESUMEN = 50;

const entrada = z
  .object({
    desarrollador: personaOYoZod.optional(),
    responsable: personaOYoZod.optional(),
    ticketId: z.number().int().positive().optional(),
    estados: z
      .array(z.enum(ESTADOS_TAREA))
      .min(1)
      .refine((v) => new Set(v).size === v.length, 'Hay estados repetidos')
      .optional(),
    soloPendientes: z.boolean().default(true),
    prioridad: z.number().int().optional(),
    creadaDesde: fechaZod.optional(),
    creadaHasta: fechaZod.optional(),
    incluirDescansos: z.boolean().default(false),
    incluirDescripcion: z.boolean().default(false),
    limite: limiteZod,
    desplazamiento: desplazamientoZod,
  })
  .strict()
  .refine((a) => !a.creadaDesde || !a.creadaHasta || a.creadaDesde <= a.creadaHasta, {
    message: 'creadaDesde es posterior a creadaHasta',
    path: ['creadaDesde'],
  });

type Entrada = z.infer<typeof entrada>;

export interface ListadoTareas {
  total: number;
  limite: number;
  desplazamiento: number;
  hayMas: boolean;
  tareas: Tarea[];
}

/** "yo" → desarrollador de la sesión; si la sesión no tiene uno, es un error del pedido. */
function desarrolladorDe(valor: number | 'yo' | undefined, sesion: Sesion, campo: string): number | undefined {
  if (valor !== 'yo') return valor;
  if (sesion.codDesarrollador === null) {
    throw new ErrorTool(
      'PARAMETRO_INVALIDO',
      `"${campo}: yo" no aplica: el usuario de la sesión no tiene un desarrollador asociado. Indicá un código de desarrollador o filtrá por ticketId.`,
    );
  }
  return sesion.codDesarrollador;
}

export function aFiltrosTareas(a: Entrada, sesion: Sesion): FiltrosTareas {
  // Sin persona ni ticket, por defecto son las tareas propias.
  const desarrollador = a.desarrollador ?? (a.responsable === undefined && a.ticketId === undefined ? 'yo' : undefined);
  const codDesarrollador = desarrolladorDe(desarrollador, sesion, 'desarrollador');
  const codResponsable = desarrolladorDe(a.responsable, sesion, 'responsable');
  return {
    ...(codDesarrollador !== undefined ? { codDesarrollador } : {}),
    ...(codResponsable !== undefined ? { codDesarrolladorResponsable: codResponsable } : {}),
    ...(a.ticketId !== undefined ? { codReclamo: a.ticketId } : {}),
    ...(a.estados ? { estados: a.estados } : {}),
    soloPendientes: a.soloPendientes,
    ...(a.prioridad !== undefined ? { prioridad: a.prioridad } : {}),
    ...(a.creadaDesde ? { creadaDesde: a.creadaDesde } : {}),
    ...(a.creadaHasta ? { creadaHasta: a.creadaHasta } : {}),
    incluirDescansos: a.incluirDescansos,
    limite: a.limite,
    desplazamiento: a.desplazamiento,
  };
}

const recortar = (s: string) => (s.length > LARGO_NOMBRE_RESUMEN ? `${s.slice(0, LARGO_NOMBRE_RESUMEN - 1).trimEnd()}…` : s);

export function resumirTareas(l: ListadoTareas): string {
  const cabecera = `${plural(l.total, 'tarea')} (${rango(l.desplazamiento, l.tareas.length)})`;
  if (!l.tareas.length) return `${cabecera}.`;
  const items = l.tareas.map((t) => {
    const prioridad = t.prioridad !== null ? ` p${t.prioridad}` : '';
    const quien = t.desarrollador ? ` (${t.desarrollador.nombre})` : '';
    return `#${t.id} ${t.estado}${prioridad} "${recortar(t.nombre)}"${quien}`;
  });
  return `${cabecera}. ${items.join('; ')}.`;
}

export function crearListarTareas({ acceso, zonaHoraria }: DependenciasTools): DefinicionTool<Entrada, ListadoTareas> {
  return {
    nombre: 'listar_tareas',
    titulo: 'Listar tareas de desarrollo',
    descripcion:
      'Lista tareas de desarrollo (asignaciones de JK3) filtrando por desarrollador asignado, responsable, ' +
      'ticket, estados, prioridad y fecha de creación, paginado y con el total. Sin desarrollador, ' +
      'responsable ni ticket, devuelve las tareas del usuario de la sesión. Por defecto solo pendientes ' +
      '(excluye FINALIZADA y ARCHIVADO) y sin la descripción completa (pedila con incluirDescripcion).',
    inputSchema: conDefs({
      type: 'object',
      properties: {
        desarrollador: personaOYoJson('Desarrollador ASIGNADO (código de desarrollador) o "yo"'),
        responsable: personaOYoJson('Desarrollador RESPONSABLE (supervisor) o "yo"'),
        ticketId: { type: 'integer', description: 'Número de ticket' },
        estados: {
          type: 'array',
          items: ref('estadoTarea'),
          minItems: 1,
          uniqueItems: true,
          description: 'OR entre valores. Si se indica, se ignora soloPendientes',
        },
        soloPendientes: { type: 'boolean', default: true, description: 'Excluye FINALIZADA y ARCHIVADO' },
        prioridad: { type: 'integer' },
        creadaDesde: { ...ref('fecha'), description: 'AAAA-MM-DD, inclusive' },
        creadaHasta: { ...ref('fecha'), description: 'AAAA-MM-DD, inclusive' },
        incluirDescansos: { type: 'boolean', default: false },
        incluirDescripcion: { type: 'boolean', default: false },
        limite: LIMITE_LISTADO_JSON,
        desplazamiento: DESPLAZAMIENTO_JSON,
      },
      additionalProperties: false,
    }),
    outputSchema: conDefs({
      type: 'object',
      properties: {
        total: { type: 'integer' },
        limite: { type: 'integer' },
        desplazamiento: { type: 'integer' },
        hayMas: { type: 'boolean' },
        tareas: { type: 'array', items: ref('tarea') },
      },
      required: ['total', 'limite', 'desplazamiento', 'hayMas', 'tareas'],
    }),
    annotations: ANOTACIONES_LECTURA,
    entrada,

    async ejecutar(args, ctx) {
      const filtros = aFiltrosTareas(args, ctx.sesion);
      const { filas, total } = await acceso.enTransaccion(async (sp) => {
        const filas = await listarTareas(sp, filtros);
        if (filas.length || filtros.desplazamiento === 0) return { filas, total: filas[0]?.TOTAL ?? 0 };
        const primera = await listarTareas(sp, { ...filtros, limite: 1, desplazamiento: 0 });
        return { filas, total: primera[0]?.TOTAL ?? 0 };
      }, ctx.medidor);

      const tareas = filas.map((f) => mapearTarea(f, zonaHoraria, args.incluirDescripcion));
      const datos: ListadoTareas = {
        total,
        limite: args.limite,
        desplazamiento: args.desplazamiento,
        hayMas: args.desplazamiento + tareas.length < total,
        tareas,
      };
      return { datos, resumen: resumirTareas(datos) };
    },
  };
}

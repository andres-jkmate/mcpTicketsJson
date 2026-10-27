import { z } from 'zod';
import type { DefinicionTool } from '@mcp-jkmate/core';
import { aFecha, aplicarContrato, aTextoONull, type AccesoDatos } from '@mcp-jkmate/firebird';
import { hoyLocal, PERIODOS, resolverFechas, resolverImporte } from '../dominio/criterio.js';
import { interpretarNumero } from '../dominio/numero.js';
import { CODIGOS_DOMINIO, ErrorTool } from '../errores.js';
import {
  ANNOTATIONS_CONSULTA,
  CLASES,
  esFechaValida,
  ESTADOS,
  jsonFecha,
  jsonFechaONull,
  jsonNumeroONull,
  jsonTextoONull,
  PATRON_FECHA,
  texto,
  type Clase,
  type Estado,
} from './esquemas.js';

/*
 * buscar_movimientos_fondos: lista resumida y paginada de movimientos de fondos (una transacción
 * de solo lectura, un SP). El servidor resuelve el número, las fechas y el importe; el SP filtra,
 * cuenta, ordena y pagina.
 */

const SP = 'PROC_LIST_MOV_FONDOS_AG';
const LIMITE_POR_DEFECTO = 20;
const LIMITE_MAXIMO = 50;

/** Fila del SP. Si la página viene vacía, trae una sola fila con ENCONTRADOS y el resto en NULL. */
interface FilaMovimiento {
  ENCONTRADOS: number;
  COD_MOVIMIENTO_FONDO: number | null;
  NRO_COMPROBANTE: string | null;
  TALONARIO: string | null;
  TIPO: string | null;
  CLASE: string | null;
  FECHA: Date | null;
  TOTAL: number | null;
  TERCERO: string | null;
  CONCEPTO: string | null;
  ESTADO: string | null;
}

export interface MovimientoResumido {
  id: number;
  numero: string;
  talonario: string | null;
  tipo: string;
  clase: Clase;
  fecha: string;
  total: number;
  tercero: string | null;
  concepto: string | null;
  estado: Estado;
}

export interface ResultadoBusqueda {
  criterio: {
    numero: string | null;
    fechaDesde: string | null;
    fechaHasta: string | null;
    importeMin: number | null;
    importeMax: number | null;
    clase: Clase | null;
    tercero: string | null;
  };
  encontrados: number;
  desde: number;
  truncado: boolean;
  movimientos: MovimientoResumido[];
}

const zFecha = z.string().regex(PATRON_FECHA, 'Fecha AAAA-MM-DD').refine(esFechaValida, 'Fecha inexistente');

const entrada = z
  .object({
    numero: z.string().trim().min(1).max(30).optional(),
    periodo: z.enum(PERIODOS).optional(),
    fechaDesde: zFecha.optional(),
    fechaHasta: zFecha.optional(),
    importe: z.number().positive().max(999_999_999_999).optional(),
    importeExacto: z.boolean().default(false),
    clase: z.enum(CLASES).optional(),
    tercero: z.string().trim().min(2).max(100).optional(),
    limite: z.number().int().min(1).max(LIMITE_MAXIMO).default(LIMITE_POR_DEFECTO),
    desde: z.number().int().min(0).default(0),
  })
  .strict();
type Entrada = z.infer<typeof entrada>;

const outputSchema = {
  type: 'object',
  properties: {
    criterio: {
      type: 'object',
      properties: {
        numero: jsonTextoONull,
        fechaDesde: jsonFechaONull,
        fechaHasta: jsonFechaONull,
        importeMin: jsonNumeroONull,
        importeMax: jsonNumeroONull,
        clase: { enum: [...CLASES, null] },
        tercero: jsonTextoONull,
      },
      required: ['numero', 'fechaDesde', 'fechaHasta', 'importeMin', 'importeMax', 'clase', 'tercero'],
      additionalProperties: false,
    },
    encontrados: { type: 'integer', minimum: 0 },
    desde: { type: 'integer', minimum: 0 },
    truncado: { type: 'boolean' },
    movimientos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          numero: { type: 'string' },
          talonario: jsonTextoONull,
          tipo: { type: 'string' },
          clase: { enum: [...CLASES] },
          fecha: jsonFecha,
          total: { type: 'number' },
          tercero: jsonTextoONull,
          concepto: jsonTextoONull,
          estado: { enum: [...ESTADOS] },
        },
        required: ['id', 'numero', 'talonario', 'tipo', 'clase', 'fecha', 'total', 'tercero', 'concepto', 'estado'],
        additionalProperties: false,
      },
    },
  },
  required: ['criterio', 'encontrados', 'desde', 'truncado', 'movimientos'],
} as const;

export interface DependenciasBuscar {
  acceso: AccesoDatos;
  /** Fecha del día 'AAAA-MM-DD' (se inyecta en los tests). */
  hoy?: () => string;
}

export function crearBuscarMovimientosFondos({ acceso, hoy = hoyLocal }: DependenciasBuscar): DefinicionTool<Entrada, ResultadoBusqueda> {
  return {
    nombre: 'buscar_movimientos_fondos',
    titulo: 'Buscar movimientos de fondos',
    descripcion: [
      'Qué hace: busca movimientos de fondos de JKMate (pagos, cobros, depósitos, movimientos varios, reversiones) y devuelve una lista resumida y paginada: id, número, talonario, tipo, clase, fecha, total, tercero, concepto y estado; además, los criterios que se aplicaron (incluido el rango de fechas por defecto), cuántos hay en total y si la lista quedó truncada.',
      'Cuándo usarla: cuando el usuario quiere encontrar uno o varios movimientos: "quiero ver el movimiento X1 9463", "¿qué pagos hice ayer?", "estoy buscando un movimiento de 500000 que hice este mes". Es el primer paso para ver el detalle de un movimiento con ver_movimiento_fondo, que pide el id que devuelve esta tool.',
      'Parámetros: todos opcionales. numero como lo dijo el usuario ("X1 9463", "X-0001-00009463" o solo "9463"); periodo (hoy, ayer, esta_semana, este_mes, mes_pasado) o fechaDesde/fechaHasta (AAAA-MM-DD); importe (se busca ±5 % y se ordena por cercanía; importeExacto: true para el valor justo); clase (pago, cobro, deposito, varios, reversion, otros); tercero (parte del nombre del cliente o proveedor); limite (1 a 50, por defecto 20) y desde para paginar. Sin número ni fechas busca el último mes; con número y sin fechas no aplica rango. Ej.: {"periodo": "ayer", "clase": "pago"}.',
      'Qué NO hacer: no mandes fechas inventadas si el usuario no nombró un período (el servidor aplica el último mes); para "ayer", "este mes", etc. usá periodo en lugar de calcular fechas. Si una búsqueda con importe no trae nada, no repitas la búsqueda sin el importe para mirar una muestra (vendría ordenada por fecha, no por cercanía): ofrecé otro período u otro importe. No la uses para ver renglones, cheques o el resumen de cuentas: eso es ver_movimiento_fondo. Si vienen varios movimientos con el mismo número, mostrá la lista y preguntá cuál, sin elegir vos.',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        numero: { type: 'string', minLength: 1, maxLength: 30, description: 'Número como lo dijo el usuario, ej. "X1 9463" o "9463".' },
        periodo: { enum: [...PERIODOS], description: 'Período relativo que resuelve el servidor con su fecha. Excluyente con fechaDesde/fechaHasta.' },
        fechaDesde: { ...jsonFecha, description: 'Desde esta fecha, inclusive.' },
        fechaHasta: { ...jsonFecha, description: 'Hasta esta fecha, inclusive.' },
        importe: { type: 'number', exclusiveMinimum: 0, description: 'Importe buscado: trae los de total entre el 95 % y el 105 %.' },
        importeExacto: { type: 'boolean', default: false, description: 'true para traer solo los de total igual al importe.' },
        clase: { enum: [...CLASES], description: 'Clase del movimiento según su tipo de comprobante.' },
        tercero: { type: 'string', minLength: 2, maxLength: 100, description: 'Parte del nombre del cliente o proveedor.' },
        limite: { type: 'integer', minimum: 1, maximum: LIMITE_MAXIMO, default: LIMITE_POR_DEFECTO, description: 'Cuántos movimientos traer.' },
        desde: { type: 'integer', minimum: 0, default: 0, description: 'Cuántos saltear (paginado).' },
      },
      additionalProperties: false,
    },
    outputSchema,
    annotations: ANNOTATIONS_CONSULTA,
    entrada,
    async ejecutar(args, ctx) {
      const datos = await buscar(acceso, args, ctx.sesion.codUsuario, hoy(), ctx.medidor);
      return { datos, resumen: resumir(datos) };
    },
  };
}

async function buscar(
  acceso: AccesoDatos,
  args: Entrada,
  codUsuario: number,
  hoy: string,
  medidor: { llamadasBase: number },
): Promise<ResultadoBusqueda> {
  let numero: { patron: string; numero: string } | null = null;
  if (args.numero !== undefined) {
    const n = interpretarNumero(args.numero);
    if (!n.ok) throw new ErrorTool('PARAMETRO_INVALIDO', n.motivo, [{ campo: 'numero', mensaje: n.motivo }]);
    numero = n;
  }

  const fechas = resolverFechas({ periodo: args.periodo, fechaDesde: args.fechaDesde, fechaHasta: args.fechaHasta, hayNumero: numero !== null }, hoy);
  if (!fechas.ok) throw new ErrorTool('PARAMETRO_INVALIDO', fechas.motivo);

  const importe = resolverImporte(args.importe, args.importeExacto);
  const clase = args.clase ?? null;
  const tercero = args.tercero ?? null;

  const filas = await acceso.enTransaccion(
    async (sp) =>
      aplicarContrato<FilaMovimiento>(
        SP,
        await sp(SP, [
          codUsuario,
          numero?.patron ?? null,
          fechas.fechaDesde,
          fechas.fechaHasta,
          importe.importe,
          importe.importeMin,
          importe.importeMax,
          clase,
          tercero,
          args.limite,
          args.desde,
        ]),
        CODIGOS_DOMINIO,
      ),
    medidor,
  );

  const movimientos = filas.filter((f) => f.COD_MOVIMIENTO_FONDO !== null).map(aMovimiento);
  const encontrados = filas[0]?.ENCONTRADOS ?? 0;
  return {
    criterio: {
      numero: numero?.numero ?? null,
      fechaDesde: fechas.fechaDesde,
      fechaHasta: fechas.fechaHasta,
      importeMin: importe.importeMin,
      importeMax: importe.importeMax,
      clase,
      tercero,
    },
    encontrados,
    desde: args.desde,
    truncado: args.desde + movimientos.length < encontrados,
    movimientos,
  };
}

function aMovimiento(f: FilaMovimiento): MovimientoResumido {
  return {
    id: f.COD_MOVIMIENTO_FONDO!,
    numero: texto(f.NRO_COMPROBANTE),
    talonario: aTextoONull(f.TALONARIO),
    tipo: texto(f.TIPO),
    clase: texto(f.CLASE) as Clase,
    fecha: aFecha(f.FECHA!),
    total: f.TOTAL ?? 0,
    tercero: aTextoONull(f.TERCERO),
    concepto: aTextoONull(f.CONCEPTO),
    estado: texto(f.ESTADO) as Estado,
  };
}

function resumir(r: ResultadoBusqueda): string {
  const { fechaDesde, fechaHasta } = r.criterio;
  const rango = fechaDesde ? ` entre el ${fechaDesde} y el ${fechaHasta}` : '';
  if (r.encontrados === 0) return `No se encontraron movimientos de fondos${rango}.`;
  if (r.movimientos.length === 0) return `${r.encontrados} movimientos de fondos${rango}; no hay más desde la posición ${r.desde + 1}.`;
  const pagina = r.truncado || r.desde > 0 ? ` Se muestran del ${r.desde + 1} al ${r.desde + r.movimientos.length}.` : '';
  return `${r.encontrados} movimiento${r.encontrados === 1 ? '' : 's'} de fondos${rango}.${pagina}`;
}

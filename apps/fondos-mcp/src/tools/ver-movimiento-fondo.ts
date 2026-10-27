import { z } from 'zod';
import type { DefinicionTool } from '@mcp-jkmate/core';
import { aFecha, aFechaHoraIsoONull, aFechaONull, aplicarContrato, aTextoONull, type AccesoDatos, type EjecutarSp, type ValorParametro } from '@mcp-jkmate/firebird';
import { CODIGOS_DOMINIO } from '../errores.js';
import {
  ANNOTATIONS_CONSULTA,
  CLASES,
  ESTADOS,
  jsonEnteroONull,
  jsonFecha,
  jsonFechaONull,
  jsonTextoONull,
  milesimos,
  texto,
  type Clase,
  type Estado,
} from './esquemas.js';

/*
 * ver_movimiento_fondo: el detalle de un movimiento de fondos por su id, en una transacción de
 * solo lectura con tres SP: cabecera, renglones (debe y haber) y cheques. Si la cabecera falla, no
 * se llama a los otros dos.
 */

const SP_CABECERA = 'PROC_GET_MOV_FONDO_AG';
const SP_RENGLONES = 'PROC_LIST_DET_MOV_FONDO_AG';
const SP_CHEQUES = 'PROC_LIST_CHEQUES_MOV_FON_AG';

// ------------------------------------------------------------------ filas de los SP

interface FilaCabecera {
  COD_MOVIMIENTO_FONDO: number;
  NRO_COMPROBANTE: string | null;
  TALONARIO: string | null;
  TIPO: string | null;
  CLASE: string;
  FECHA: Date;
  CONCEPTO: string | null;
  TOTAL: number | null;
  ESTADO: string;
  NUM_CAJA: number | null;
  USUARIO: string | null;
  CARGADO_POR: string | null;
  FECHA_HORA_CARGA: Date | null;
  TERCERO_ROL: string | null;
  TERCERO: string | null;
  TERCERO_DOCUMENTO: string | null;
  REVERTIDO_POR: number | null;
  REVIERTE_A: number | null;
  COD_ASIENTO_CONTABLE: number | null;
}

interface FilaRenglon {
  LADO: string;
  CUENTA: string | null;
  IMPORTE: number;
  LEYENDA: string | null;
  ES_FONDOS: number | null;
  UNIDADES: number | null;
  TERCERO: string | null;
  DOCUMENTO: string | null;
  CENTRO_COSTO: string | null;
  SUCURSAL: string | null;
}

interface FilaCheque {
  BANCO: string | null;
  SUCURSAL: string | null;
  NRO_CHEQUE: string | null;
  TIPO_CHEQUE: string | null;
  ESTADO_CHEQUE: string | null;
  IMPORTE: number | null;
  FECHA_EMISION: Date | null;
  FECHA_VENCIMIENTO: Date | null;
  FECHA_COBRO: Date | null;
}

// ------------------------------------------------------------------ contrato

export interface Renglon {
  cuenta: string;
  importe: number;
  leyenda: string | null;
  esFondos: boolean;
  unidades?: number;
  tercero?: string;
  documento?: string;
  centroCosto?: string;
  sucursal?: string;
}

export interface ImporteCuenta {
  cuenta: string;
  importe: number;
}

export interface Cheque {
  banco: string;
  sucursal: string | null;
  numero: string;
  tipo: string | null;
  estado: string | null;
  importe: number;
  emision: string | null;
  vencimiento: string | null;
  cobro: string | null;
}

export interface DetalleMovimiento {
  id: number;
  numero: string;
  talonario: string | null;
  tipo: string;
  clase: Clase;
  fecha: string;
  concepto: string | null;
  total: number;
  estado: Estado;
  caja: number | null;
  usuario: string;
  cargadoPor: string | null;
  cargadoEl: string | null;
  tercero: { rol: 'cliente' | 'proveedor'; nombre: string; documento: string | null } | null;
  resumen: { entroA: ImporteCuenta[]; salioDe: ImporteCuenta[] };
  debe: Renglon[];
  haber: Renglon[];
  cheques: Cheque[];
  relacionados: { revertidoPor: number | null; revierteA: number | null; asientoContable: number | null };
}

const entrada = z.object({ id: z.number().int().min(1) }).strict();
type Entrada = z.infer<typeof entrada>;

const IMPORTE_CUENTA = {
  type: 'object',
  properties: { cuenta: { type: 'string' }, importe: { type: 'number' } },
  required: ['cuenta', 'importe'],
  additionalProperties: false,
} as const;

const RENGLON = {
  type: 'object',
  properties: {
    cuenta: { type: 'string' },
    importe: { type: 'number' },
    leyenda: jsonTextoONull,
    esFondos: { type: 'boolean' },
    unidades: { type: 'number', description: 'Solo si difiere del importe (moneda extranjera).' },
    tercero: { type: 'string' },
    documento: { type: 'string' },
    centroCosto: { type: 'string' },
    sucursal: { type: 'string' },
  },
  required: ['cuenta', 'importe', 'leyenda', 'esFondos'],
  additionalProperties: false,
} as const;

const outputSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    numero: { type: 'string' },
    talonario: jsonTextoONull,
    tipo: { type: 'string' },
    clase: { enum: [...CLASES] },
    fecha: jsonFecha,
    concepto: jsonTextoONull,
    total: { type: 'number' },
    estado: { enum: [...ESTADOS] },
    caja: jsonEnteroONull,
    usuario: { type: 'string' },
    cargadoPor: jsonTextoONull,
    cargadoEl: { type: ['string', 'null'], format: 'date-time' },
    tercero: {
      type: ['object', 'null'],
      properties: { rol: { enum: ['cliente', 'proveedor'] }, nombre: { type: 'string' }, documento: jsonTextoONull },
      required: ['rol', 'nombre', 'documento'],
      additionalProperties: false,
    },
    resumen: {
      type: 'object',
      properties: { entroA: { type: 'array', items: IMPORTE_CUENTA }, salioDe: { type: 'array', items: IMPORTE_CUENTA } },
      required: ['entroA', 'salioDe'],
      additionalProperties: false,
    },
    debe: { type: 'array', items: RENGLON },
    haber: { type: 'array', items: RENGLON },
    cheques: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          banco: { type: 'string' },
          sucursal: jsonTextoONull,
          numero: { type: 'string' },
          tipo: jsonTextoONull,
          estado: jsonTextoONull,
          importe: { type: 'number' },
          emision: jsonFechaONull,
          vencimiento: jsonFechaONull,
          cobro: jsonFechaONull,
        },
        required: ['banco', 'sucursal', 'numero', 'tipo', 'estado', 'importe', 'emision', 'vencimiento', 'cobro'],
        additionalProperties: false,
      },
    },
    relacionados: {
      type: 'object',
      properties: { revertidoPor: jsonEnteroONull, revierteA: jsonEnteroONull, asientoContable: jsonEnteroONull },
      required: ['revertidoPor', 'revierteA', 'asientoContable'],
      additionalProperties: false,
    },
  },
  required: [
    'id',
    'numero',
    'talonario',
    'tipo',
    'clase',
    'fecha',
    'concepto',
    'total',
    'estado',
    'caja',
    'usuario',
    'cargadoPor',
    'cargadoEl',
    'tercero',
    'resumen',
    'debe',
    'haber',
    'cheques',
    'relacionados',
  ],
} as const;

export interface DependenciasVer {
  acceso: AccesoDatos;
  /** Zona de la base para el offset de `cargadoEl`; por defecto la del proceso (misma máquina que Claude Desktop). */
  zonaHoraria?: string;
}

export function crearVerMovimientoFondo({
  acceso,
  zonaHoraria = Intl.DateTimeFormat().resolvedOptions().timeZone,
}: DependenciasVer): DefinicionTool<Entrada, DetalleMovimiento> {
  return {
    nombre: 'ver_movimiento_fondo',
    titulo: 'Ver el detalle de un movimiento de fondos',
    descripcion: [
      'Qué hace: devuelve el detalle de un movimiento de fondos de JKMate por su id: cabecera (número, talonario, tipo, clase, fecha, concepto, total, estado, caja, usuario y fecha de carga), tercero, renglones del debe y del haber, un resumen de qué cuentas de fondos entraron (debe) o salieron (haber) con su importe, cheques y movimientos relacionados (reversión y asiento contable).',
      'Cuándo usarla: después de buscar_movimientos_fondos, cuando el usuario quiere ver o entender un movimiento puntual ("quiero ver el movimiento X1 9463", "mostrame el detalle", "¿de qué caja salió ese pago?"). Para contestar de dónde salió o adónde entró la plata alcanza con resumen.',
      'Parámetros: id, el id del movimiento que devolvió buscar_movimientos_fondos. Ej.: {"id": 104923}.',
      'Qué NO hacer: no adivines el id a partir del número del comprobante (el número se repite entre talonarios): primero buscar_movimientos_fondos. No la llames movimiento por movimiento para recorrer una lista si alcanza con lo que devolvió la búsqueda.',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'integer', minimum: 1, description: 'Id del movimiento (lo devuelve buscar_movimientos_fondos).' } },
      required: ['id'],
      additionalProperties: false,
    },
    outputSchema,
    annotations: ANNOTATIONS_CONSULTA,
    entrada,
    async ejecutar(args, ctx) {
      const datos = await acceso.enTransaccion((sp) => ver(sp, args.id, ctx.sesion.codUsuario, zonaHoraria), ctx.medidor);
      return { datos, resumen: resumir(datos) };
    },
  };
}

async function ver(sp: EjecutarSp, id: number, codUsuario: number, zona: string): Promise<DetalleMovimiento> {
  const llamar = async <T>(nombre: string, parametros: ValorParametro[]) => aplicarContrato<T>(nombre, await sp(nombre, parametros), CODIGOS_DOMINIO);

  const [c] = await llamar<FilaCabecera>(SP_CABECERA, [codUsuario, id]);
  if (!c) throw new Error(`${SP_CABECERA} no devolvió filas para el movimiento ${id}`);
  const renglones = await llamar<FilaRenglon>(SP_RENGLONES, [id]);
  const cheques = await llamar<FilaCheque>(SP_CHEQUES, [id]);

  const debe = renglones.filter((r) => texto(r.LADO) === 'D').map(aRenglon);
  const haber = renglones.filter((r) => texto(r.LADO) === 'H').map(aRenglon);
  const rol = texto(c.TERCERO_ROL);

  return {
    id: c.COD_MOVIMIENTO_FONDO,
    numero: texto(c.NRO_COMPROBANTE),
    talonario: aTextoONull(c.TALONARIO),
    tipo: texto(c.TIPO),
    clase: texto(c.CLASE) as Clase,
    fecha: aFecha(c.FECHA),
    concepto: aTextoONull(c.CONCEPTO),
    total: c.TOTAL ?? 0,
    estado: texto(c.ESTADO) as Estado,
    caja: c.NUM_CAJA,
    usuario: texto(c.USUARIO),
    cargadoPor: aTextoONull(c.CARGADO_POR),
    cargadoEl: aFechaHoraIsoONull(c.FECHA_HORA_CARGA, zona),
    tercero: rol === 'cliente' || rol === 'proveedor' ? { rol, nombre: texto(c.TERCERO), documento: aTextoONull(c.TERCERO_DOCUMENTO) } : null,
    resumen: { entroA: porCuentaDeFondos(debe), salioDe: porCuentaDeFondos(haber) },
    debe,
    haber,
    cheques: cheques.map(aCheque),
    relacionados: { revertidoPor: c.REVERTIDO_POR, revierteA: c.REVIERTE_A, asientoContable: c.COD_ASIENTO_CONTABLE },
  };
}

/** Renglón sin claves vacías: tercero, documento, centro de costo y sucursal solo si hay dato; unidades solo si difieren del importe. */
function aRenglon(r: FilaRenglon): Renglon {
  const renglon: Renglon = { cuenta: texto(r.CUENTA), importe: r.IMPORTE, leyenda: aTextoONull(r.LEYENDA), esFondos: r.ES_FONDOS === 1 };
  if (r.UNIDADES !== null && r.UNIDADES !== r.IMPORTE) renglon.unidades = r.UNIDADES;
  const opcionales = { tercero: r.TERCERO, documento: r.DOCUMENTO, centroCosto: r.CENTRO_COSTO, sucursal: r.SUCURSAL };
  for (const [clave, valor] of Object.entries(opcionales)) {
    const limpio = aTextoONull(valor);
    if (limpio !== null) renglon[clave as keyof typeof opcionales] = limpio;
  }
  return renglon;
}

/** Suma por cuenta los renglones de cuentas de fondos (Caja, bancos), en el orden en que aparecen. */
function porCuentaDeFondos(renglones: Renglon[]): ImporteCuenta[] {
  const porCuenta = new Map<string, number>();
  for (const r of renglones.filter((r) => r.esFondos)) porCuenta.set(r.cuenta, milesimos((porCuenta.get(r.cuenta) ?? 0) + r.importe));
  return [...porCuenta].map(([cuenta, importe]) => ({ cuenta, importe }));
}

function aCheque(f: FilaCheque): Cheque {
  return {
    banco: texto(f.BANCO),
    sucursal: aTextoONull(f.SUCURSAL),
    numero: texto(f.NRO_CHEQUE),
    tipo: aTextoONull(f.TIPO_CHEQUE),
    estado: aTextoONull(f.ESTADO_CHEQUE),
    importe: f.IMPORTE ?? 0,
    emision: aFechaONull(f.FECHA_EMISION),
    vencimiento: aFechaONull(f.FECHA_VENCIMIENTO),
    cobro: aFechaONull(f.FECHA_COBRO),
  };
}

function resumir(d: DetalleMovimiento): string {
  const tercero = d.tercero ? `, ${d.tercero.rol} ${d.tercero.nombre}` : '';
  const estado = d.estado === 'vigente' ? '' : ` (${d.estado})`;
  // El nombre del tercero suele terminar en punto ("S.A."): no se duplica.
  return `Movimiento ${d.id} ${d.numero}: ${d.tipo} del ${d.fecha} por ${d.total}${tercero}${estado}`.replace(/\.?$/, '.');
}

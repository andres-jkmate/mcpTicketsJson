import { z } from 'zod';
import type { DefinicionTool } from '@mcp-jkmate/core';
import { aFecha, aplicarContrato, type AccesoDatos, type EjecutarSp, type ValorParametro } from '@mcp-jkmate/firebird';
import { elegirArticulo, opcionesProveedor, type ArticuloEncontrado, type OrigenArticulo } from '../dominio/articulo.js';
import { normalizarNumero, type Letra } from '../dominio/numero.js';
import { CAMPOS_PERFIL, elegirOpcion, elegirTipo, pendientePorPerfil, type CampoPerfil, type OpcionPerfil } from '../dominio/perfil.js';
import { opcion, type Bloqueo, type Origen, type Pendiente, type Resolucion, type Resuelto } from '../dominio/tipos.js';
import { CODIGOS_DOMINIO } from '../errores.js';
import {
  centavos,
  hoyEnArgentina,
  inputSchemaRegistrar,
  jsonFecha,
  jsonMontoItem,
  MAX_ITEMS,
  zCodigo,
  zFecha,
  zMonto,
  type EntradaRegistrar,
} from './esquemas.js';

/*
 * preparar_factura_proveedor: resuelve un borrador de factura de proveedor contra la base sin
 * escribir nada (una transacción de solo lectura). Cada dato sale resuelto con su origen o como
 * pendiente con opciones; cuando no queda nada, `paraRegistrar` es el input de
 * registrar_factura_proveedor.
 */

// ------------------------------------------------------------------ filas de los SP

interface FilaPerfil {
  CAMPO: string;
  CODIGO: number;
  DESCRIPCION: string | null;
  POR_DEFECTO: number | null;
  LETRA: string | null;
  MODALIDAD: string | null;
}

interface FilaProveedor {
  COD_PROVEEDOR: number;
  RAZON_SOCIAL: string | null;
  NOMBRE_COMERCIAL: string | null;
}

interface FilaArticulo {
  COD_ARTICULO: string;
  DESCRIPCION: string | null;
  ORIGEN: string;
}

interface FilaCalculo {
  NETO: number | null;
  NO_GRAVADO: number | null;
  EXENTO: number | null;
  IVA: number | null;
  IMPUESTO: number | null;
  PERCEPCIONES: number | null;
}

interface FilaBloqueo {
  CODIGO: string;
  MENSAJE: string | null;
}

interface FilaCuota {
  CUOTA: number;
  FECHA_VENCIMIENTO: Date;
}

// ------------------------------------------------------------------ contrato

export interface ImportesLinea {
  neto: number;
  noGravado: number;
  exento: number;
  iva: number;
  impuesto: number;
  percepciones: number;
}

export interface ItemPreparado {
  orden: number;
  texto: string | null;
  monto: number;
  articulo: { codigo: string; descripcion: string; origen: Origen } | null;
  calculado: ImportesLinea | null;
}

export interface FacturaPreparada {
  listoParaRegistrar: boolean;
  resueltos: Record<string, Resuelto>;
  pendientes: Pendiente[];
  bloqueos: Bloqueo[];
  items: ItemPreparado[];
  totalCalculado: number | null;
  vencimiento: string | null;
  paraRegistrar: EntradaRegistrar | null;
}

const entrada = z
  .object({
    proveedor: z.string().trim().min(1).max(100).optional(),
    proveedorId: zCodigo.optional(),
    numero: z.string().trim().min(1).max(30).optional(),
    fecha: zFecha.optional(),
    fechaRecepcion: zFecha.optional(),
    fechaContable: zFecha.optional(),
    fechaIva: zFecha.optional(),
    perfilId: zCodigo.optional(),
    tipoComprobanteId: zCodigo.optional(),
    sucursalId: zCodigo.optional(),
    centroCostoId: zCodigo.optional(),
    condicionCompraId: zCodigo.optional(),
    monedaId: zCodigo.optional(),
    concepto: z.string().max(50).optional(),
    items: z
      .array(
        z
          .object({
            articulo: z.string().trim().min(1).max(100).optional(),
            articuloCodigo: z.string().trim().min(1).max(50).optional(),
            monto: zMonto,
          })
          .strict()
          .refine((i) => i.articulo !== undefined || i.articuloCodigo !== undefined, 'Indicá articulo o articuloCodigo'),
      )
      .min(1)
      .max(MAX_ITEMS),
  })
  .strict();
type Entrada = z.infer<typeof entrada>;

const ORIGENES: Origen[] = [
  'informado',
  'unico',
  'por_defecto',
  'letra',
  'plantilla_proveedor',
  'historial_proveedor',
  'catalogo',
  'hoy',
  'calculado',
];
const ID = { type: ['integer', 'string'] } as const;
const OPCION = {
  type: 'object',
  properties: {
    id: ID,
    descripcion: { type: 'string' },
    sugerido: { type: 'boolean' },
    motivoSugerencia: { type: ['string', 'null'] },
  },
  required: ['id', 'descripcion', 'sugerido', 'motivoSugerencia'],
  additionalProperties: false,
} as const;
const IMPORTE = { type: 'number' } as const;

const outputSchema = {
  type: 'object',
  properties: {
    listoParaRegistrar: { type: 'boolean' },
    resueltos: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: { id: ID, descripcion: { type: 'string' }, origen: { enum: ORIGENES } },
        required: ['id', 'descripcion', 'origen'],
        additionalProperties: false,
      },
    },
    pendientes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          campo: { type: 'string' },
          texto: { type: ['string', 'null'] },
          motivo: { type: 'string' },
          opciones: { type: 'array', items: OPCION },
        },
        required: ['campo', 'texto', 'motivo', 'opciones'],
        additionalProperties: false,
      },
    },
    bloqueos: {
      type: 'array',
      items: {
        type: 'object',
        properties: { codigo: { type: 'string' }, mensaje: { type: 'string' } },
        required: ['codigo', 'mensaje'],
        additionalProperties: false,
      },
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          orden: { type: 'integer' },
          texto: { type: ['string', 'null'] },
          monto: { type: 'number' },
          articulo: {
            type: ['object', 'null'],
            properties: { codigo: { type: 'string' }, descripcion: { type: 'string' }, origen: { enum: ORIGENES } },
            required: ['codigo', 'descripcion', 'origen'],
            additionalProperties: false,
          },
          calculado: {
            type: ['object', 'null'],
            properties: { neto: IMPORTE, noGravado: IMPORTE, exento: IMPORTE, iva: IMPORTE, impuesto: IMPORTE, percepciones: IMPORTE },
            required: ['neto', 'noGravado', 'exento', 'iva', 'impuesto', 'percepciones'],
            additionalProperties: false,
          },
        },
        required: ['orden', 'texto', 'monto', 'articulo', 'calculado'],
        additionalProperties: false,
      },
    },
    totalCalculado: { type: ['number', 'null'] },
    vencimiento: { ...jsonFecha, type: ['string', 'null'] },
    paraRegistrar: { ...inputSchemaRegistrar, type: ['object', 'null'] },
  },
  required: ['listoParaRegistrar', 'resueltos', 'pendientes', 'bloqueos', 'items', 'totalCalculado', 'vencimiento', 'paraRegistrar'],
} as const;

const texto = (valor: string | null | undefined) => valor?.trim() ?? '';
const numeroONull = (valor: number | null | undefined) => valor ?? 0;

function aOpcionPerfil(fila: FilaPerfil): OpcionPerfil {
  const letra = texto(fila.LETRA);
  return {
    campo: fila.CAMPO.trim() as CampoPerfil,
    codigo: fila.CODIGO,
    descripcion: texto(fila.DESCRIPCION) || String(fila.CODIGO),
    porDefecto: fila.POR_DEFECTO === 1,
    letra: letra === 'A' || letra === 'B' || letra === 'C' ? letra : null,
    modalidad: fila.MODALIDAD?.trim() ?? null,
  };
}

function aArticulo(fila: FilaArticulo): ArticuloEncontrado {
  return { codigo: fila.COD_ARTICULO.trim(), descripcion: texto(fila.DESCRIPCION), origen: fila.ORIGEN.trim() as OrigenArticulo };
}

const INFORMADO: Record<CampoPerfil, keyof Entrada> = {
  perfil: 'perfilId',
  tipoComprobante: 'tipoComprobanteId',
  sucursal: 'sucursalId',
  centroCosto: 'centroCostoId',
  condicionCompra: 'condicionCompraId',
  moneda: 'monedaId',
};

export interface DependenciasPreparar {
  acceso: AccesoDatos;
  /** Fecha del día 'AAAA-MM-DD' (se inyecta en los tests). */
  hoy?: () => string;
}

export function crearPrepararFacturaProveedor({
  acceso,
  hoy = hoyEnArgentina,
}: DependenciasPreparar): DefinicionTool<Entrada, FacturaPreparada> {
  return {
    nombre: 'preparar_factura_proveedor',
    titulo: 'Preparar una factura de proveedor',
    descripcion: [
      'Qué hace: resuelve contra JKMate un borrador de factura de proveedor sin grabar nada: devuelve cada dato con su origen o, si es ambiguo, las opciones; los importes de cada línea calculados por la base (neto, IVA, percepciones), el total, el vencimiento, los bloqueos de negocio y, cuando no falta nada, el input listo para registrar_factura_proveedor.',
      'Cuándo usarla: cada vez que el usuario pide cargar una factura de proveedor o cambia algo del borrador ("agregá 50.000 de gastos varios"). El borrador lo mantenés vos y lo reenviás completo en cada llamada; mostrale al usuario la vista previa y preguntale por los pendientes.',
      'Parámetros: proveedor (texto libre: razón social, nombre comercial, código o CUIT) o proveedorId; numero como lo dijo el usuario; fechas opcionales (AAAA-MM-DD, por defecto hoy); perfilId, tipoComprobanteId, sucursalId, centroCostoId, condicionCompraId y monedaId solo con códigos de las opciones que devolvió esta tool; concepto opcional; items con articulo (texto) o articuloCodigo y monto total con impuestos. Ej.: {"proveedor": "Telecom", "numero": "A1 135", "items": [{"articulo": "Internet", "monto": 200000}]}.',
      'Qué NO hacer: no inventes códigos para los pendientes: elegí entre las opciones devueltas o preguntale al usuario. No la uses para grabar: eso lo hace registrar_factura_proveedor, después de la confirmación del usuario.',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        proveedor: { type: 'string', minLength: 1, maxLength: 100, description: 'Proveedor en texto libre (razón social, nombre comercial, código o CUIT).' },
        proveedorId: { type: 'integer', minimum: 1, description: 'Código del proveedor, si ya se eligió.' },
        numero: { type: 'string', minLength: 1, maxLength: 30, description: 'Número como lo dijo el usuario, ej. "A1 135".' },
        fecha: { ...jsonFecha, description: 'Fecha del comprobante (por defecto hoy).' },
        fechaRecepcion: { ...jsonFecha, description: 'Fecha de recepción (por defecto la del comprobante).' },
        fechaContable: { ...jsonFecha, description: 'Fecha contable (por defecto la del comprobante).' },
        fechaIva: { ...jsonFecha, description: 'Fecha de IVA (por defecto la del comprobante).' },
        perfilId: { type: 'integer', minimum: 1, description: 'Perfil de facturación de compras.' },
        tipoComprobanteId: { type: 'integer', minimum: 1, description: 'Tipo de comprobante.' },
        sucursalId: { type: 'integer', minimum: 1, description: 'Sucursal.' },
        centroCostoId: { type: 'integer', minimum: 1, description: 'Centro de costo.' },
        condicionCompraId: { type: 'integer', minimum: 1, description: 'Condición de compra.' },
        monedaId: { type: 'integer', minimum: 1, description: 'Moneda.' },
        concepto: { type: 'string', maxLength: 50, description: 'Concepto de la factura.' },
        items: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_ITEMS,
          items: {
            type: 'object',
            properties: {
              articulo: { type: 'string', minLength: 1, maxLength: 100, description: 'Artículo o concepto en texto libre, ej. "Internet".' },
              articuloCodigo: { type: 'string', minLength: 1, maxLength: 50, description: 'Código del artículo, si ya se eligió.' },
              monto: jsonMontoItem,
            },
            required: ['monto'],
            anyOf: [{ required: ['articulo'] }, { required: ['articuloCodigo'] }],
            additionalProperties: false,
          },
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
    outputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    entrada,
    async ejecutar(args, ctx) {
      const datos = await acceso.enTransaccion((sp) => preparar(sp, args, ctx.sesion.codUsuario, hoy()), ctx.medidor);
      return { datos, resumen: resumir(datos) };
    },
  };
}

async function preparar(sp: EjecutarSp, args: Entrada, codUsuario: number, hoy: string): Promise<FacturaPreparada> {
  const llamar = async <T>(nombre: string, parametros: ValorParametro[]) =>
    aplicarContrato<T>(nombre, await sp(nombre, parametros), CODIGOS_DOMINIO);

  const resueltos: Record<string, Resuelto> = {};
  const pendientes: Pendiente[] = [];
  const bloqueos: Bloqueo[] = [];

  /** Vuelca una resolución. Un bloqueo de un dato informado también deja el dato pendiente, con las opciones válidas. */
  function registrar(campo: string, r: Resolucion, opciones: OpcionPerfil[] = []) {
    if (r.tipo === 'resuelto') resueltos[campo] = r.valor;
    else if (r.tipo === 'pendiente') pendientes.push(r.pendiente);
    else {
      bloqueos.push(r.bloqueo);
      pendientes.push({ campo, texto: null, motivo: r.bloqueo.mensaje, opciones: opciones.map((o) => opcion(o.codigo, o.descripcion)) });
    }
  }

  // Perfil y sus opciones. Si el perfil sale de la regla, se vuelve a pedir con ese perfil para traer sus listas.
  let opcionesPerfil = (await llamar<FilaPerfil>('PROC_LIST_PERFIL_OPC_AG', [codUsuario, args.perfilId ?? null])).map(aOpcionPerfil);
  const perfiles = opcionesPerfil.filter((o) => o.campo === 'perfil');
  const perfil = elegirOpcion('perfil', perfiles, args.perfilId);
  registrar('perfil', perfil, perfiles);
  if (perfil.tipo === 'resuelto' && args.perfilId === undefined) {
    opcionesPerfil = (await llamar<FilaPerfil>('PROC_LIST_PERFIL_OPC_AG', [codUsuario, perfil.valor.id])).map(aOpcionPerfil);
  }

  // Número: se normaliza; la letra filtra el tipo.
  let numero: string | null = null;
  let letra: Letra | null = null;
  if (args.numero === undefined) {
    pendientes.push({ campo: 'numero', texto: null, motivo: 'Falta el número de la factura', opciones: [] });
  } else {
    const n = normalizarNumero(args.numero);
    if (n.ok) {
      numero = n.numero;
      letra = n.letra;
      resueltos.numero = { id: n.numero, descripcion: n.numero, origen: 'informado' };
    } else {
      pendientes.push({ campo: 'numero', texto: args.numero, motivo: n.motivo, opciones: [] });
    }
  }

  for (const campo of CAMPOS_PERFIL.filter((c) => c !== 'perfil')) {
    if (perfil.tipo !== 'resuelto') {
      registrar(campo, pendientePorPerfil(campo));
      continue;
    }
    const opciones = opcionesPerfil.filter((o) => o.campo === campo);
    const informado = args[INFORMADO[campo]] as number | undefined;
    registrar(campo, campo === 'tipoComprobante' ? elegirTipo(opciones, letra, informado) : elegirOpcion(campo, opciones, informado), opciones);
  }

  // Fechas: la del comprobante es hoy si no viene; las demás, la del comprobante.
  const fecha = args.fecha ?? hoy;
  resueltos.fecha = { id: fecha, descripcion: fecha, origen: args.fecha ? 'informado' : 'hoy' };
  const fechas = { fecha, fechaRecepcion: fecha, fechaContable: fecha, fechaIva: fecha };
  for (const campo of ['fechaRecepcion', 'fechaContable', 'fechaIva'] as const) {
    const valor = args[campo] ?? fecha;
    fechas[campo] = valor;
    resueltos[campo] = { id: valor, descripcion: valor, origen: args[campo] ? 'informado' : 'calculado' };
  }

  // Proveedor.
  let proveedorId: number | null = null;
  if (args.proveedorId !== undefined) {
    const [fila] = await llamar<FilaProveedor>('PROC_LIST_PROVEEDORES_FC_AG', [null, args.proveedorId]);
    if (fila) {
      proveedorId = fila.COD_PROVEEDOR;
      resueltos.proveedor = { id: fila.COD_PROVEEDOR, descripcion: nombreProveedor(fila), origen: 'informado' };
    } else {
      registrar('proveedor', {
        tipo: 'bloqueo',
        bloqueo: { codigo: 'PROVEEDOR_INEXISTENTE', mensaje: `No hay un proveedor habilitado con código ${args.proveedorId}` },
      });
    }
  } else if (args.proveedor !== undefined) {
    const filas = await llamar<FilaProveedor>('PROC_LIST_PROVEEDORES_FC_AG', [args.proveedor, null]);
    const [unico] = filas;
    if (unico && filas.length === 1) {
      proveedorId = unico.COD_PROVEEDOR;
      resueltos.proveedor = { id: unico.COD_PROVEEDOR, descripcion: nombreProveedor(unico), origen: 'informado' };
    } else if (!unico) {
      pendientes.push({ campo: 'proveedor', texto: args.proveedor, motivo: `Ningún proveedor habilitado coincide con "${args.proveedor}"`, opciones: [] });
    } else {
      // Sugerencia: el único candidato que tiene en su plantilla algún artículo de los ítems.
      const textos = args.items.flatMap((i) => (i.articulo ? [i.articulo] : []));
      const candidatos = [];
      for (const f of filas) {
        const enPlantilla: ArticuloEncontrado[] = [];
        for (const t of textos) {
          const encontrados = (await llamar<FilaArticulo>('PROC_LIST_ARTICULOS_FC_AG', [f.COD_PROVEEDOR, t])).map(aArticulo);
          enPlantilla.push(...encontrados.filter((a) => a.origen === 'plantilla_proveedor'));
        }
        candidatos.push({ id: f.COD_PROVEEDOR, descripcion: nombreProveedor(f), enPlantilla });
      }
      pendientes.push({
        campo: 'proveedor',
        texto: args.proveedor,
        motivo: `Hay ${filas.length} proveedores que coinciden`,
        opciones: opcionesProveedor(candidatos),
      });
    }
  } else {
    pendientes.push({ campo: 'proveedor', texto: null, motivo: 'Falta el proveedor', opciones: [] });
  }

  // Ítems: artículo (si hay proveedor o código) e importes calculados por la base.
  const items: ItemPreparado[] = [];
  for (const [i, item] of args.items.entries()) {
    const campo = `items[${i}].articulo`;
    let articulo: ItemPreparado['articulo'] = null;
    if (item.articuloCodigo !== undefined) {
      // Por código se busca en el catálogo (sin proveedor) para no depender del nivel que encuentre primero.
      const codigo = item.articuloCodigo;
      const encontrado = (await llamar<FilaArticulo>('PROC_LIST_ARTICULOS_FC_AG', [null, codigo]))
        .map(aArticulo)
        .find((a) => a.codigo === codigo);
      if (encontrado) articulo = { codigo, descripcion: encontrado.descripcion, origen: 'informado' };
      else registrar(campo, { tipo: 'bloqueo', bloqueo: { codigo: 'ARTICULO_INEXISTENTE', mensaje: `No existe el artículo ${codigo}` } });
    } else if (item.articulo !== undefined && proveedorId !== null) {
      const encontrados = (await llamar<FilaArticulo>('PROC_LIST_ARTICULOS_FC_AG', [proveedorId, item.articulo])).map(aArticulo);
      const r = elegirArticulo(campo, item.articulo, encontrados);
      if (r.tipo === 'resuelto') articulo = { codigo: String(r.valor.id), descripcion: r.valor.descripcion, origen: r.valor.origen };
      else registrar(campo, r);
    }

    let calculado: ImportesLinea | null = null;
    if (articulo && proveedorId !== null) {
      const [c] = await llamar<FilaCalculo>('PROC_GET_CALC_LINEA_FC_AG', [articulo.codigo, item.monto, proveedorId, fecha]);
      if (c) {
        calculado = {
          neto: numeroONull(c.NETO),
          noGravado: numeroONull(c.NO_GRAVADO),
          exento: numeroONull(c.EXENTO),
          iva: numeroONull(c.IVA),
          impuesto: numeroONull(c.IMPUESTO),
          percepciones: numeroONull(c.PERCEPCIONES),
        };
      }
    }
    items.push({ orden: i + 1, texto: item.articulo ?? null, monto: item.monto, articulo, calculado });
  }

  const totalCalculado = items.every((i) => i.calculado)
    ? centavos(items.reduce((t, i) => t + Object.values(i.calculado!).reduce((a, b) => a + b, 0), 0))
    : null;

  // Bloqueos de negocio (duplicado, período cerrado, fecha de IVA, condición, proveedor, país).
  const id = (campo: string) => {
    const valor = resueltos[campo]?.id;
    return typeof valor === 'number' ? valor : null;
  };
  const validaciones = await llamar<FilaBloqueo>('PROC_LIST_VAL_FAC_PROV_AG', [
    proveedorId,
    id('tipoComprobante'),
    numero,
    fechas.fecha,
    fechas.fechaContable,
    fechas.fechaIva,
    id('condicionCompra'),
  ]);
  for (const v of validaciones) bloqueos.push({ codigo: v.CODIGO.trim(), mensaje: texto(v.MENSAJE) || v.CODIGO.trim() });

  // Vencimiento de la primera cuota, desde la fecha de recepción según la condición.
  let vencimiento: string | null = null;
  const condicion = id('condicionCompra');
  if (condicion !== null && totalCalculado !== null && !bloqueos.some((b) => b.codigo === 'CONDICION_NO_CUENTA_CORRIENTE')) {
    const [cuota] = await llamar<FilaCuota>('PROC_LIST_CUOTAS_FC_AG', [condicion, totalCalculado, fechas.fechaRecepcion]);
    if (cuota) vencimiento = aFecha(cuota.FECHA_VENCIMIENTO);
  }

  const listoParaRegistrar = pendientes.length === 0 && bloqueos.length === 0 && items.every((i) => i.articulo);
  const paraRegistrar: EntradaRegistrar | null = listoParaRegistrar
    ? {
        proveedorId: proveedorId!,
        perfilId: id('perfil')!,
        tipoComprobanteId: id('tipoComprobante')!,
        numero: numero!,
        ...fechas,
        sucursalId: id('sucursal')!,
        centroCostoId: id('centroCosto')!,
        condicionCompraId: id('condicionCompra')!,
        monedaId: id('moneda')!,
        ...(args.concepto !== undefined ? { concepto: args.concepto } : {}),
        items: items.map((i) => ({ articuloCodigo: i.articulo!.codigo, monto: i.monto })),
      }
    : null;

  return { listoParaRegistrar, resueltos, pendientes, bloqueos, items, totalCalculado, vencimiento, paraRegistrar };
}

function nombreProveedor(fila: FilaProveedor): string {
  return texto(fila.RAZON_SOCIAL) || texto(fila.NOMBRE_COMERCIAL) || String(fila.COD_PROVEEDOR);
}

function resumir(f: FacturaPreparada): string {
  const total = f.totalCalculado !== null ? ` Total calculado: ${f.totalCalculado}.` : '';
  if (f.listoParaRegistrar) return `Factura lista para registrar.${total} Mostrale la vista previa al usuario y pedile confirmación.`;
  const partes = [];
  if (f.pendientes.length) partes.push(`pendientes: ${f.pendientes.map((p) => p.campo).join(', ')}`);
  if (f.bloqueos.length) partes.push(`bloqueos: ${f.bloqueos.map((b) => b.codigo).join(', ')}`);
  return `Factura incompleta (${partes.join('; ')}).${total}`;
}

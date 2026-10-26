import { z } from 'zod';
import { PATRON_NORMALIZADO } from '../dominio/numero.js';

/** Esquemas compartidos por las dos tools: fechas y el input de `registrar_factura_proveedor`. */

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function esFechaValida(texto: string): boolean {
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(texto);
}

export const zFecha = z.string().regex(PATRON_FECHA, 'Fecha AAAA-MM-DD').refine(esFechaValida, 'Fecha inexistente');
export const zCodigo = z.number().int().min(1);
export const zMonto = z.number().positive().max(999_999_999_999);

export const MAX_ITEMS = 20;

export const jsonFecha = { type: 'string', format: 'date', pattern: PATRON_FECHA.source } as const;
const jsonCodigo = { type: 'integer', minimum: 1 } as const;
const jsonMonto = { type: 'number', exclusiveMinimum: 0, description: 'Total de la línea con impuestos incluidos.' } as const;

export const entradaRegistrar = z
  .object({
    proveedorId: zCodigo,
    perfilId: zCodigo,
    tipoComprobanteId: zCodigo,
    numero: z.string().regex(PATRON_NORMALIZADO, 'Número L-PPPP-NNNNNNNN (ej. A-0001-00000135)'),
    fecha: zFecha,
    fechaRecepcion: zFecha,
    fechaContable: zFecha,
    fechaIva: zFecha,
    sucursalId: zCodigo,
    centroCostoId: zCodigo,
    condicionCompraId: zCodigo,
    monedaId: zCodigo,
    concepto: z.string().max(50).optional(),
    items: z
      .array(z.object({ articuloCodigo: z.string().min(1).max(50), monto: zMonto }).strict())
      .min(1)
      .max(MAX_ITEMS),
  })
  .strict();

export type EntradaRegistrar = z.infer<typeof entradaRegistrar>;

export const inputSchemaRegistrar = {
  type: 'object',
  properties: {
    proveedorId: { ...jsonCodigo, description: 'Código del proveedor.' },
    perfilId: { ...jsonCodigo, description: 'Perfil de facturación de compras.' },
    tipoComprobanteId: { ...jsonCodigo, description: 'Tipo de comprobante (factura) del perfil.' },
    numero: { type: 'string', pattern: PATRON_NORMALIZADO.source, description: 'Número normalizado, ej. A-0001-00000135.' },
    fecha: { ...jsonFecha, description: 'Fecha del comprobante.' },
    fechaRecepcion: { ...jsonFecha, description: 'Fecha de recepción.' },
    fechaContable: { ...jsonFecha, description: 'Fecha contable.' },
    fechaIva: { ...jsonFecha, description: 'Fecha de IVA.' },
    sucursalId: { ...jsonCodigo, description: 'Sucursal del perfil.' },
    centroCostoId: { ...jsonCodigo, description: 'Centro de costo del perfil.' },
    condicionCompraId: { ...jsonCodigo, description: 'Condición de compra del perfil (cuenta corriente).' },
    monedaId: { ...jsonCodigo, description: 'Moneda del perfil.' },
    concepto: { type: 'string', maxLength: 50, description: 'Concepto de la factura (opcional).' },
    items: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_ITEMS,
      items: {
        type: 'object',
        properties: {
          articuloCodigo: { type: 'string', minLength: 1, maxLength: 50, description: 'Código del artículo.' },
          monto: jsonMonto,
        },
        required: ['articuloCodigo', 'monto'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'proveedorId',
    'perfilId',
    'tipoComprobanteId',
    'numero',
    'fecha',
    'fechaRecepcion',
    'fechaContable',
    'fechaIva',
    'sucursalId',
    'centroCostoId',
    'condicionCompraId',
    'monedaId',
    'items',
  ],
  additionalProperties: false,
} as const;

export const jsonMontoItem = jsonMonto;

/** Hoy en la zona de la base, como 'AAAA-MM-DD'. */
export function hoyEnArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
}

/** Redondeo a centavos para sumar importes sin arrastrar error de coma flotante. */
export function centavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

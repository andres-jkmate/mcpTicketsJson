import type { DefinicionTool } from '@mcp-jkmate/core';
import { aFecha, aPersona, aplicarContrato, type AccesoDatos, type Persona, type ValorParametro } from '@mcp-jkmate/firebird';
import { CODIGOS_DOMINIO } from '../errores.js';
import { centavos, entradaRegistrar, inputSchemaRegistrar, jsonFecha, type EntradaRegistrar } from './esquemas.js';

/*
 * registrar_factura_proveedor: graba una factura ya resuelta por preparar_factura_proveedor. En
 * una sola transacción de escritura llama a los tres SP que encadenan la grabación de JK3
 * (cabecera, una línea por ítem y cierre); si alguno falla no queda nada grabado.
 */

interface FilaCabecera {
  COD_COMPROBANTE_PROVEEDOR: number;
}

interface FilaCierre {
  COD_COMPROBANTE_PROVEEDOR: number;
  NRO_COMPROBANTE: string;
  CODIGO_COMP: number | null;
  COD_PROVEEDOR: number;
  RAZON_SOCIAL: string | null;
  FECHA: Date;
  TOTAL: number;
  CUOTA: number;
  FECHA_VENCIMIENTO: Date;
  MONTO_CUOTA: number;
}

export interface FacturaRegistrada {
  comprobanteId: number;
  numero: string;
  numeroInterno: number | null;
  proveedor: Persona;
  /** 'AAAA-MM-DD' */
  fecha: string;
  total: number;
  cuotas: { cuota: number; vencimiento: string; monto: number }[];
}

const outputSchema = {
  type: 'object',
  properties: {
    comprobanteId: { type: 'integer' },
    numero: { type: 'string' },
    numeroInterno: { type: ['integer', 'null'] },
    proveedor: {
      type: 'object',
      properties: { id: { type: 'integer' }, nombre: { type: 'string' } },
      required: ['id', 'nombre'],
      additionalProperties: false,
    },
    fecha: jsonFecha,
    total: { type: 'number' },
    cuotas: {
      type: 'array',
      items: {
        type: 'object',
        properties: { cuota: { type: 'integer' }, vencimiento: jsonFecha, monto: { type: 'number' } },
        required: ['cuota', 'vencimiento', 'monto'],
        additionalProperties: false,
      },
    },
  },
  required: ['comprobanteId', 'numero', 'numeroInterno', 'proveedor', 'fecha', 'total', 'cuotas'],
} as const;

export function crearRegistrarFacturaProveedor({ acceso }: { acceso: AccesoDatos }): DefinicionTool<EntradaRegistrar, FacturaRegistrada> {
  return {
    nombre: 'registrar_factura_proveedor',
    titulo: 'Registrar una factura de proveedor',
    descripcion: [
      'Qué hace: graba en JKMate una factura de proveedor a cuenta corriente (comprobante, líneas, alícuotas, crédito y cuotas) en una sola transacción, igual que el formulario de JK3. Vuelve a validar todo contra la base y el perfil del usuario; si algo falla no graba nada. Devuelve el comprobante creado, el total grabado y las cuotas.',
      'Cuándo usarla: solo cuando preparar_factura_proveedor devolvió listoParaRegistrar: true, le mostraste al usuario la vista previa y el usuario confirmó que la grabes.',
      'Parámetros: exactamente el objeto paraRegistrar que devolvió preparar_factura_proveedor, sin cambios. Ej.: {"proveedorId": 4, "perfilId": 1, "tipoComprobanteId": 132, "numero": "A-0001-00000135", "fecha": "2026-10-24", "fechaRecepcion": "2026-10-24", "fechaContable": "2026-10-24", "fechaIva": "2026-10-24", "sucursalId": 3, "centroCostoId": 2, "condicionCompraId": 4, "monedaId": 3, "items": [{"articuloCodigo": "CON-5", "monto": 200000}]}.',
      'Qué NO hacer: no la llames sin haber mostrado la vista previa de preparar_factura_proveedor y tener la confirmación explícita del usuario; no armes el input a mano ni con texto libre. No la uses para corregir una factura ya grabada: llamarla de nuevo intenta grabar otra (y falla por duplicada).',
    ].join('\n'),
    inputSchema: inputSchemaRegistrar,
    outputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    entrada: entradaRegistrar,
    async ejecutar(args, ctx) {
      const codUsuario = ctx.sesion.codUsuario;
      const filas = await acceso.enTransaccionEscritura(async (sp) => {
        const llamar = async <T>(nombre: string, parametros: ValorParametro[]) =>
          aplicarContrato<T>(nombre, await sp(nombre, parametros), CODIGOS_DOMINIO);

        const [cabecera] = await llamar<FilaCabecera>('PROC_INS_FAC_PROV_AG', [
          codUsuario,
          args.perfilId,
          args.proveedorId,
          args.tipoComprobanteId,
          args.numero,
          args.fecha,
          args.fechaRecepcion,
          args.fechaContable,
          args.fechaIva,
          args.sucursalId,
          args.centroCostoId,
          args.condicionCompraId,
          args.monedaId,
          args.concepto ?? null,
        ]);
        if (!cabecera) throw new Error('PROC_INS_FAC_PROV_AG no devolvió el comprobante');
        const comprobante = cabecera.COD_COMPROBANTE_PROVEEDOR;

        for (const [i, item] of args.items.entries()) {
          await llamar('PROC_INS_DET_FAC_PROV_AG', [comprobante, i + 1, item.articuloCodigo, item.monto, args.centroCostoId]);
        }

        const cierre = await llamar<FilaCierre>('PROC_INS_FIN_FAC_PROV_AG', [comprobante, codUsuario]);
        // Sin filas no hay forma de informar lo grabado: se revierte como error interno.
        if (!cierre.length) throw new Error('PROC_INS_FIN_FAC_PROV_AG no devolvió el comprobante grabado');
        return cierre;
      }, ctx.medidor);

      const primera = filas[0]!;
      const datos: FacturaRegistrada = {
        comprobanteId: primera.COD_COMPROBANTE_PROVEEDOR,
        numero: primera.NRO_COMPROBANTE.trim(),
        numeroInterno: primera.CODIGO_COMP ?? null,
        proveedor: aPersona(primera.COD_PROVEEDOR, primera.RAZON_SOCIAL)!,
        fecha: aFecha(primera.FECHA),
        total: centavos(primera.TOTAL),
        cuotas: filas.map((f) => ({ cuota: f.CUOTA, vencimiento: aFecha(f.FECHA_VENCIMIENTO), monto: centavos(f.MONTO_CUOTA) })),
      };
      const cuotas = datos.cuotas.map((c) => `${c.cuota}: ${c.monto} al ${c.vencimiento}`).join('; ');
      return {
        datos,
        resumen: `Factura ${datos.numero} de ${datos.proveedor.nombre} registrada (comprobante ${datos.comprobanteId}), total ${datos.total}. Cuotas: ${cuotas}.`,
      };
    },
  };
}

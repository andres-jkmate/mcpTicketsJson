import { relojDesdeTexto, type Fila, type ValorParametro } from '@mcp-jkmate/firebird';
import type { ManejadorSp } from '../apoyo.js';

/*
 * Base simulada con los datos de CREAR_JK3_20261016 que usa el design: un perfil (1 GENERAL) para
 * el usuario 28, tipos 132 (A) y 134 (C), sucursal 3, centro de costo 2, condición 4 (cuenta
 * corriente, 1 cuota a 10 días), monedas 3 y 5 sin defecto. Los SP simulan los `_AG` de D13.
 */

export const USUARIO_CON_PERFIL = 28;

interface OpcionesBase {
  /** Opciones extra del perfil 1 (ej. una condición de contado o una moneda por defecto). */
  extraPerfil?: Fila[];
  /** Fecha de IVA hasta la que el período está cerrado ('AAAA-MM-DD'). */
  cerradoHasta?: string;
}

const PERFIL_1: Fila[] = [
  { CAMPO: 'tipoComprobante', CODIGO: 132, DESCRIPCION: 'FACTURA DE COMPRAS A JKMT', POR_DEFECTO: 0, LETRA: 'A', MODALIDAD: null },
  { CAMPO: 'tipoComprobante', CODIGO: 134, DESCRIPCION: 'FACTURA DE COMPRAS C JKMT', POR_DEFECTO: 0, LETRA: 'C', MODALIDAD: null },
  { CAMPO: 'sucursal', CODIGO: 3, DESCRIPCION: 'Christian', POR_DEFECTO: 0, LETRA: null, MODALIDAD: null },
  { CAMPO: 'centroCosto', CODIGO: 2, DESCRIPCION: 'Parque', POR_DEFECTO: 0, LETRA: null, MODALIDAD: null },
  { CAMPO: 'condicionCompra', CODIGO: 4, DESCRIPCION: 'CUENTA CORRIENTE', POR_DEFECTO: 0, LETRA: null, MODALIDAD: 'Cuenta Corriente' },
  { CAMPO: 'moneda', CODIGO: 3, DESCRIPCION: 'Pesos', POR_DEFECTO: 0, LETRA: null, MODALIDAD: null },
  { CAMPO: 'moneda', CODIGO: 5, DESCRIPCION: 'DOLARES', POR_DEFECTO: 0, LETRA: null, MODALIDAD: null },
];

const PROVEEDORES = [
  { COD_PROVEEDOR: 4, RAZON_SOCIAL: 'TELECOM ARGENTINA S.A', NOMBRE_COMERCIAL: 'TELECOM', CUIT: '30-63945373-8' },
  { COD_PROVEEDOR: 2, RAZON_SOCIAL: 'TELECOM PERSONAL S.A.', NOMBRE_COMERCIAL: 'PERSONAL', CUIT: '30-67818644-5' },
  { COD_PROVEEDOR: 10, RAZON_SOCIAL: 'SOFUN SRL', NOMBRE_COMERCIAL: 'SOFUN', CUIT: '30-71000000-1' },
];

const ARTICULOS = [
  { COD_ARTICULO: 'CON-5', DESCRIPCION: 'INTERNET 21%' },
  { COD_ARTICULO: 'CON-6', DESCRIPCION: 'INTERNET MOVIL 21%' },
  { COD_ARTICULO: 'CON-7', DESCRIPCION: 'INTERNET SATELITAL 21%' },
  { COD_ARTICULO: 'CON-33', DESCRIPCION: 'GASTOS VARIOS 21%' },
  { COD_ARTICULO: 'CON-10', DESCRIPCION: 'HONORARIOS PROFESIONALES' },
  { COD_ARTICULO: 'CON-11', DESCRIPCION: 'HONORARIOS DIRECTORES' },
  { COD_ARTICULO: 'CON-12', DESCRIPCION: 'HONORARIOS EXENTOS' },
];

/** Plantillas por proveedor (PLANTILLAS_PROV_ARTICULOS). SOFUN no tiene. */
const PLANTILLAS: Record<number, string[]> = { 4: ['CON-5', 'CON-33'] };

const contiene = (a: string, b: string) => a.toUpperCase().includes(b.toUpperCase());

function sumarDias(fecha: string, dias: number): Date {
  const d = relojDesdeTexto(fecha);
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

export function baseCrear(opciones: OpcionesBase = {}): Record<string, ManejadorSp> {
  const perfil1 = [...PERFIL_1, ...(opciones.extraPerfil ?? [])];
  return {
    PROC_LIST_PERFIL_OPC_AG: ([usuario, perfil]: ValorParametro[]) => {
      if (usuario !== USUARIO_CON_PERFIL) {
        return [{ RESULTADO: 0, MENSAJE_ERROR: 'NO_AUTORIZADO: el usuario no tiene perfiles de facturación de compras' }];
      }
      const filas: Fila[] = [{ CAMPO: 'perfil', CODIGO: 1, DESCRIPCION: 'GENERAL', POR_DEFECTO: 0, LETRA: null, MODALIDAD: null }];
      return perfil === 1 ? [...filas, ...perfil1] : filas;
    },
    PROC_LIST_PROVEEDORES_FC_AG: ([texto, id]) =>
      PROVEEDORES.filter((p) =>
        id !== null
          ? p.COD_PROVEEDOR === id
          : contiene(p.RAZON_SOCIAL, String(texto)) || contiene(p.NOMBRE_COMERCIAL, String(texto)) || p.CUIT === texto,
      ),
    PROC_LIST_ARTICULOS_FC_AG: ([proveedor, texto]) => {
      const coincide = (a: (typeof ARTICULOS)[number]) => contiene(a.DESCRIPCION, String(texto)) || a.COD_ARTICULO === texto;
      const plantilla = ARTICULOS.filter((a) => PLANTILLAS[proveedor as number]?.includes(a.COD_ARTICULO) && coincide(a));
      if (plantilla.length) return plantilla.map((a) => ({ ...a, CONDICION_IMPOSITIVA: 'Gravado', ORIGEN: 'plantilla_proveedor' }));
      return ARTICULOS.filter(coincide).map((a) => ({ ...a, CONDICION_IMPOSITIVA: 'Gravado', ORIGEN: 'catalogo' }));
    },
    PROC_GET_CALC_LINEA_FC_AG: ([articulo, monto]) => {
      const total = monto as number;
      if (String(articulo).startsWith('CON-1')) {
        return [{ NETO: 0, NO_GRAVADO: 0, EXENTO: total, IVA: 0, IMPUESTO: 0, PERCEPCIONES: 0, PRECIO_UNITARIO: total }];
      }
      const neto = Math.round((total / 1.21) * 1000) / 1000;
      return [{ NETO: neto, NO_GRAVADO: 0, EXENTO: 0, IVA: Math.round((total - neto) * 1000) / 1000, IMPUESTO: 0, PERCEPCIONES: 0, PRECIO_UNITARIO: neto }];
    },
    PROC_LIST_VAL_FAC_PROV_AG: ([, , , , , fechaIva, condicion]) => {
      const bloqueos: Fila[] = [];
      if (opciones.cerradoHasta && String(fechaIva) <= opciones.cerradoHasta) {
        bloqueos.push({ CODIGO: 'PERIODO_CERRADO', MENSAJE: 'La fecha de IVA cae en un período cerrado' });
      }
      const modalidad = perfil1.find((o) => o.CAMPO === 'condicionCompra' && o.CODIGO === condicion)?.MODALIDAD;
      if (condicion !== null && modalidad !== 'Cuenta Corriente') {
        bloqueos.push({ CODIGO: 'CONDICION_NO_CUENTA_CORRIENTE', MENSAJE: 'El prototipo solo registra facturas a cuenta corriente' });
      }
      return bloqueos;
    },
    PROC_LIST_CUOTAS_FC_AG: ([, total, fechaRecepcion]) => [
      { CUOTA: 1, FECHA_VENCIMIENTO: sumarDias(String(fechaRecepcion), 10), MONTO_CUOTA: total },
    ],
  };
}

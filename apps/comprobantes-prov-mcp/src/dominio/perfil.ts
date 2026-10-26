import type { Letra } from './numero.js';
import { opcion, type Resolucion } from './tipos.js';

/**
 * Regla del perfil de facturación de compras (la misma del formulario `facturaproveedor`): si hay
 * una sola opción se usa; si no, la marcada por defecto; si no, queda pendiente con la lista. Se
 * aplica igual al perfil y, dentro de él, al tipo, la sucursal, el centro de costo, la condición y
 * la moneda.
 */

export const CAMPOS_PERFIL = ['perfil', 'tipoComprobante', 'sucursal', 'centroCosto', 'condicionCompra', 'moneda'] as const;
export type CampoPerfil = (typeof CAMPOS_PERFIL)[number];

/** Una opción del perfil (fila de PROC_LIST_PERFIL_OPC_AG ya convertida). */
export interface OpcionPerfil {
  campo: CampoPerfil;
  codigo: number;
  descripcion: string;
  porDefecto: boolean;
  /** Solo tipos: letra según el código AFIP. */
  letra: Letra | null;
  /** Solo condiciones: modalidad de pago. */
  modalidad: string | null;
}

const NOMBRES: Record<CampoPerfil, { singular: string; plural: string }> = {
  perfil: { singular: 'el perfil', plural: 'perfiles de facturación de compras' },
  tipoComprobante: { singular: 'el tipo de comprobante', plural: 'tipos de comprobante' },
  sucursal: { singular: 'la sucursal', plural: 'sucursales' },
  centroCosto: { singular: 'el centro de costo', plural: 'centros de costo' },
  condicionCompra: { singular: 'la condición de compra', plural: 'condiciones de compra' },
  moneda: { singular: 'la moneda', plural: 'monedas' },
};

export function nombreCampo(campo: CampoPerfil): string {
  return NOMBRES[campo].singular;
}

/** Aplica la regla a las opciones de un campo. `informado` es el código que mandó el agente, si lo hay. */
export function elegirOpcion(campo: CampoPerfil, opciones: OpcionPerfil[], informado?: number): Resolucion {
  const { singular, plural } = NOMBRES[campo];
  if (informado !== undefined) {
    const elegida = opciones.find((o) => o.codigo === informado);
    if (elegida) return { tipo: 'resuelto', valor: { id: elegida.codigo, descripcion: elegida.descripcion, origen: 'informado' } };
    return {
      tipo: 'bloqueo',
      bloqueo: { codigo: 'FUERA_DEL_PERFIL', mensaje: `${mayuscula(singular)} ${informado} no está entre las opciones del perfil` },
    };
  }
  const [unica] = opciones;
  if (unica && opciones.length === 1) {
    return { tipo: 'resuelto', valor: { id: unica.codigo, descripcion: unica.descripcion, origen: 'unico' } };
  }
  const porDefecto = opciones.find((o) => o.porDefecto);
  if (porDefecto) {
    return { tipo: 'resuelto', valor: { id: porDefecto.codigo, descripcion: porDefecto.descripcion, origen: 'por_defecto' } };
  }
  return {
    tipo: 'pendiente',
    pendiente: {
      campo,
      texto: null,
      motivo: opciones.length ? `Hay ${opciones.length} ${plural} posibles y ninguna opción marcada por defecto` : `El perfil no tiene ${plural}`,
      opciones: opciones.map((o) => opcion(o.codigo, o.descripcion)),
    },
  };
}

/**
 * Tipo de comprobante: si se conoce la letra del número, primero se filtran los tipos del perfil
 * por esa letra. Si el filtro deja uno solo de varios, el origen es `letra`.
 */
export function elegirTipo(opciones: OpcionPerfil[], letra: Letra | null, informado?: number): Resolucion {
  if (!letra) return elegirOpcion('tipoComprobante', opciones, informado);
  const deLaLetra = opciones.filter((o) => o.letra === letra);
  if (informado !== undefined && opciones.some((o) => o.codigo === informado) && !deLaLetra.some((o) => o.codigo === informado)) {
    return {
      tipo: 'bloqueo',
      bloqueo: { codigo: 'TIPO_NO_COINCIDE_CON_LETRA', mensaje: `El tipo de comprobante ${informado} no es de letra ${letra}` },
    };
  }
  if (!deLaLetra.length && informado === undefined) {
    return {
      tipo: 'pendiente',
      pendiente: {
        campo: 'tipoComprobante',
        texto: letra,
        motivo: `El perfil no tiene tipos de factura de letra ${letra}`,
        opciones: [],
      },
    };
  }
  const resolucion = elegirOpcion('tipoComprobante', deLaLetra.length ? deLaLetra : opciones, informado);
  if (resolucion.tipo === 'resuelto' && resolucion.valor.origen === 'unico' && opciones.length > 1) {
    return { tipo: 'resuelto', valor: { ...resolucion.valor, origen: 'letra' } };
  }
  return resolucion;
}

/** Pendiente de un campo que no se puede resolver hasta elegir el perfil. */
export function pendientePorPerfil(campo: CampoPerfil): Resolucion {
  return { tipo: 'pendiente', pendiente: { campo, texto: null, motivo: 'Depende del perfil', opciones: [] } };
}

function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

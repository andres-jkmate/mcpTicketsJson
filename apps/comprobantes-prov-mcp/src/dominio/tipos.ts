/** Piezas de la respuesta de `preparar_factura_proveedor` que arma la lógica de resolución. */

export type Origen =
  | 'informado'
  | 'unico'
  | 'por_defecto'
  | 'letra'
  | 'plantilla_proveedor'
  | 'historial_proveedor'
  | 'catalogo'
  | 'hoy'
  | 'calculado';

export interface Resuelto {
  id: number | string;
  descripcion: string;
  origen: Origen;
}

export interface Opcion {
  id: number | string;
  descripcion: string;
  sugerido: boolean;
  motivoSugerencia: string | null;
}

export interface Pendiente {
  campo: string;
  texto: string | null;
  motivo: string;
  opciones: Opcion[];
}

export interface Bloqueo {
  codigo: string;
  mensaje: string;
}

/** Resultado de resolver un dato: un valor con su origen, un pendiente o un bloqueo. */
export type Resolucion =
  | { tipo: 'resuelto'; valor: Resuelto }
  | { tipo: 'pendiente'; pendiente: Pendiente }
  | { tipo: 'bloqueo'; bloqueo: Bloqueo };

export function opcion(id: number | string, descripcion: string): Opcion {
  return { id, descripcion, sugerido: false, motivoSugerencia: null };
}

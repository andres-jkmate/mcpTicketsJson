import { opcion, type Opcion, type Resolucion } from './tipos.js';

/**
 * Artículo de un ítem. PROC_LIST_ARTICULOS_FC_AG ya devuelve solo el primer nivel con resultados
 * (plantilla del proveedor, historial con el proveedor o catálogo), así que todas las filas
 * comparten origen.
 */

export type OrigenArticulo = 'plantilla_proveedor' | 'historial_proveedor' | 'catalogo';

export interface ArticuloEncontrado {
  codigo: string;
  descripcion: string;
  origen: OrigenArticulo;
}

const NIVELES: Record<OrigenArticulo, string> = {
  plantilla_proveedor: 'la plantilla del proveedor',
  historial_proveedor: 'las facturas anteriores del proveedor',
  catalogo: 'el catálogo',
};

/** `campo` es el nombre del pendiente (ej. `items[0].articulo`); `texto`, lo que dijo el usuario. */
export function elegirArticulo(campo: string, texto: string, encontrados: ArticuloEncontrado[]): Resolucion {
  const [unico] = encontrados;
  if (unico && encontrados.length === 1) {
    return { tipo: 'resuelto', valor: { id: unico.codigo, descripcion: unico.descripcion, origen: unico.origen } };
  }
  return {
    tipo: 'pendiente',
    pendiente: {
      campo,
      texto,
      motivo: unico
        ? `Hay ${encontrados.length} artículos que coinciden en ${NIVELES[unico.origen]}`
        : `Ningún artículo coincide con "${texto}"`,
      opciones: encontrados.map((a) => opcion(a.codigo, a.descripcion)),
    },
  };
}

export interface ProveedorCandidato {
  id: number;
  descripcion: string;
  /** Artículos de los ítems que el proveedor tiene en su plantilla (búsqueda con origen plantilla). */
  enPlantilla: ArticuloEncontrado[];
}

/**
 * Opciones de un proveedor ambiguo. Si uno solo de los candidatos tiene en su plantilla algún
 * artículo de los ítems, queda sugerido con ese motivo.
 */
export function opcionesProveedor(candidatos: ProveedorCandidato[]): Opcion[] {
  const conPlantilla = candidatos.filter((c) => c.enPlantilla.some((a) => a.origen === 'plantilla_proveedor'));
  const sugerido = conPlantilla.length === 1 ? conPlantilla[0] : undefined;
  return candidatos.map((c) => {
    if (c !== sugerido) return opcion(c.id, c.descripcion);
    const articulos = [...new Set(c.enPlantilla.map((a) => a.descripcion))].join(', ');
    return { id: c.id, descripcion: c.descripcion, sugerido: true, motivoSugerencia: `Tiene ${articulos} en su plantilla` };
  });
}

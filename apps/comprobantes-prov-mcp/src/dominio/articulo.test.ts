import { describe, expect, it } from 'vitest';
import { elegirArticulo, opcionesProveedor, type ArticuloEncontrado } from './articulo.js';

const INTERNET: ArticuloEncontrado = { codigo: 'CON-5', descripcion: 'INTERNET 21%', origen: 'plantilla_proveedor' };

describe('artículo de un ítem', () => {
  it('un solo artículo en la plantilla → resuelto con origen plantilla_proveedor', () => {
    expect(elegirArticulo('items[0].articulo', 'Internet', [INTERNET])).toEqual({
      tipo: 'resuelto',
      valor: { id: 'CON-5', descripcion: 'INTERNET 21%', origen: 'plantilla_proveedor' },
    });
  });

  it('tres artículos en el catálogo → pendiente con los tres como opciones', () => {
    const catalogo: ArticuloEncontrado[] = [
      { codigo: 'CON-10', descripcion: 'HONORARIOS PROFESIONALES', origen: 'catalogo' },
      { codigo: 'CON-11', descripcion: 'HONORARIOS DIRECTORES', origen: 'catalogo' },
      { codigo: 'CON-12', descripcion: 'HONORARIOS EXENTOS', origen: 'catalogo' },
    ];
    const r = elegirArticulo('items[0].articulo', 'honorarios', catalogo);
    expect(r).toMatchObject({
      tipo: 'pendiente',
      pendiente: { campo: 'items[0].articulo', texto: 'honorarios', motivo: 'Hay 3 artículos que coinciden en el catálogo' },
    });
    if (r.tipo === 'pendiente') expect(r.pendiente.opciones.map((o) => o.id)).toEqual(['CON-10', 'CON-11', 'CON-12']);
  });

  it('ningún artículo → pendiente sin opciones', () => {
    expect(elegirArticulo('items[1].articulo', 'xyz', [])).toMatchObject({
      tipo: 'pendiente',
      pendiente: { opciones: [], motivo: 'Ningún artículo coincide con "xyz"' },
    });
  });
});

describe('proveedor ambiguo con sugerencia', () => {
  it('marca como sugerido al único que tiene el artículo en su plantilla', () => {
    expect(
      opcionesProveedor([
        { id: 4, descripcion: 'TELECOM ARGENTINA S.A', enPlantilla: [INTERNET] },
        { id: 2, descripcion: 'TELECOM PERSONAL S.A.', enPlantilla: [] },
      ]),
    ).toEqual([
      { id: 4, descripcion: 'TELECOM ARGENTINA S.A', sugerido: true, motivoSugerencia: 'Tiene INTERNET 21% en su plantilla' },
      { id: 2, descripcion: 'TELECOM PERSONAL S.A.', sugerido: false, motivoSugerencia: null },
    ]);
  });

  it('si ninguno o más de uno lo tiene, no sugiere', () => {
    const ninguno = opcionesProveedor([
      { id: 4, descripcion: 'A', enPlantilla: [] },
      { id: 2, descripcion: 'B', enPlantilla: [] },
    ]);
    const ambos = opcionesProveedor([
      { id: 4, descripcion: 'A', enPlantilla: [INTERNET] },
      { id: 2, descripcion: 'B', enPlantilla: [INTERNET] },
    ]);
    expect([...ninguno, ...ambos].every((o) => !o.sugerido)).toBe(true);
  });
});

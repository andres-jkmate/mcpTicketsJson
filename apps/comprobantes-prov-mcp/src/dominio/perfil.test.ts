import { describe, expect, it } from 'vitest';
import { elegirOpcion, elegirTipo, pendientePorPerfil, type OpcionPerfil } from './perfil.js';

function op(campo: OpcionPerfil['campo'], codigo: number, descripcion: string, extra: Partial<OpcionPerfil> = {}): OpcionPerfil {
  return { campo, codigo, descripcion, porDefecto: false, letra: null, modalidad: null, ...extra };
}

const MONEDAS = [op('moneda', 3, 'Pesos'), op('moneda', 5, 'DOLARES')];
const TIPOS = [op('tipoComprobante', 132, 'FACTURA A', { letra: 'A' }), op('tipoComprobante', 134, 'FACTURA C', { letra: 'C' })];

describe('regla del perfil', () => {
  it('una sola opción → se usa con origen unico (escenario "Dato resuelto")', () => {
    expect(elegirOpcion('sucursal', [op('sucursal', 3, 'Christian')])).toEqual({
      tipo: 'resuelto',
      valor: { id: 3, descripcion: 'Christian', origen: 'unico' },
    });
  });

  it('varias opciones sin defecto → pendiente con exactamente esas opciones', () => {
    const r = elegirOpcion('moneda', MONEDAS);
    expect(r).toEqual({
      tipo: 'pendiente',
      pendiente: {
        campo: 'moneda',
        texto: null,
        motivo: 'Hay 2 monedas posibles y ninguna opción marcada por defecto',
        opciones: [
          { id: 3, descripcion: 'Pesos', sugerido: false, motivoSugerencia: null },
          { id: 5, descripcion: 'DOLARES', sugerido: false, motivoSugerencia: null },
        ],
      },
    });
  });

  it('opción por defecto → se usa con origen por_defecto', () => {
    const condiciones = [op('condicionCompra', 4, 'CUENTA CORRIENTE'), op('condicionCompra', 1, 'CONTADO', { porDefecto: true })];
    expect(elegirOpcion('condicionCompra', condiciones)).toEqual({
      tipo: 'resuelto',
      valor: { id: 1, descripcion: 'CONTADO', origen: 'por_defecto' },
    });
  });

  it('un valor informado dentro de la lista se usa con origen informado', () => {
    expect(elegirOpcion('moneda', MONEDAS, 5)).toMatchObject({ tipo: 'resuelto', valor: { id: 5, origen: 'informado' } });
  });

  it('un valor informado fuera de la lista es un bloqueo', () => {
    expect(elegirOpcion('sucursal', [op('sucursal', 3, 'Christian')], 1)).toEqual({
      tipo: 'bloqueo',
      bloqueo: { codigo: 'FUERA_DEL_PERFIL', mensaje: 'La sucursal 1 no está entre las opciones del perfil' },
    });
  });

  it('sin opciones → pendiente sin opciones', () => {
    expect(elegirOpcion('centroCosto', [])).toMatchObject({ tipo: 'pendiente', pendiente: { opciones: [], motivo: /no tiene/ } });
  });

  it('dependencia del perfil', () => {
    expect(pendientePorPerfil('moneda')).toEqual({
      tipo: 'pendiente',
      pendiente: { campo: 'moneda', texto: null, motivo: 'Depende del perfil', opciones: [] },
    });
  });
});

describe('tipo desde la letra', () => {
  it('perfil con A y C, número de letra A → el tipo A con origen letra', () => {
    expect(elegirTipo(TIPOS, 'A')).toEqual({ tipo: 'resuelto', valor: { id: 132, descripcion: 'FACTURA A', origen: 'letra' } });
  });

  it('sin letra se aplica la regla común (pendiente)', () => {
    expect(elegirTipo(TIPOS, null)).toMatchObject({ tipo: 'pendiente', pendiente: { campo: 'tipoComprobante' } });
  });

  it('letra sin tipos en el perfil → pendiente sin opciones', () => {
    expect(elegirTipo(TIPOS, 'B')).toMatchObject({ tipo: 'pendiente', pendiente: { texto: 'B', opciones: [] } });
  });

  it('un tipo informado de otra letra es un bloqueo', () => {
    expect(elegirTipo(TIPOS, 'A', 134)).toMatchObject({ tipo: 'bloqueo', bloqueo: { codigo: 'TIPO_NO_COINCIDE_CON_LETRA' } });
  });

  it('un único tipo en el perfil sale con origen unico', () => {
    expect(elegirTipo([TIPOS[0]!], 'A')).toMatchObject({ tipo: 'resuelto', valor: { origen: 'unico' } });
  });
});

import { describe, expect, it } from 'vitest';
import { relojDesdeTexto, type Fila } from '@mcp-jkmate/firebird';
import { crearRegistrarFacturaProveedor } from '../src/tools/registrar-factura-proveedor.js';
import { accesoSimulado, conectarCliente, type ManejadorSp } from './apoyo.js';

const BORRADOR = {
  proveedorId: 4,
  perfilId: 1,
  tipoComprobanteId: 132,
  numero: 'A-0001-00000135',
  fecha: '2026-10-24',
  fechaRecepcion: '2026-10-24',
  fechaContable: '2026-10-24',
  fechaIva: '2026-10-24',
  sucursalId: 3,
  centroCostoId: 2,
  condicionCompraId: 4,
  monedaId: 3,
  items: [
    { articuloCodigo: 'CON-5', monto: 121000 },
    { articuloCodigo: 'CON-33', monto: 50000 },
  ],
};

const CIERRE: Fila = {
  COD_COMPROBANTE_PROVEEDOR: 16330,
  NRO_COMPROBANTE: 'A-0001-00000135',
  CODIGO_COMP: 20261000012,
  COD_PROVEEDOR: 4,
  RAZON_SOCIAL: 'TELECOM ARGENTINA S.A ',
  FECHA: relojDesdeTexto('2026-10-24'),
  TOTAL: 171000,
};

function base(sobre: Record<string, ManejadorSp> = {}): Record<string, ManejadorSp> {
  return {
    PROC_INS_FAC_PROV_AG: () => [{ COD_COMPROBANTE_PROVEEDOR: 16330 }],
    PROC_INS_DET_FAC_PROV_AG: () => [{}],
    PROC_INS_FIN_FAC_PROV_AG: () => [
      { ...CIERRE, CUOTA: 1, FECHA_VENCIMIENTO: relojDesdeTexto('2026-11-03'), MONTO_CUOTA: 100000 },
      { ...CIERRE, CUOTA: 2, FECHA_VENCIMIENTO: relojDesdeTexto('2026-12-03'), MONTO_CUOTA: 71000 },
    ],
    ...sobre,
  };
}

async function registrar(manejadores: Record<string, ManejadorSp>, argumentos: Record<string, unknown> = BORRADOR) {
  const { acceso, llamadas } = accesoSimulado(manejadores);
  const { cliente, eventos } = await conectarCliente([crearRegistrarFacturaProveedor({ acceso })]);
  await cliente.listTools();
  const resultado = await cliente.callTool({ name: 'registrar_factura_proveedor', arguments: argumentos });
  return { resultado, llamadas, eventos };
}

describe('registrar_factura_proveedor', () => {
  it('llama cabecera, una línea por ítem y cierre, en orden y en una sola transacción de escritura', async () => {
    const { resultado, llamadas } = await registrar(base());
    expect(resultado.isError).toBeFalsy();
    expect(llamadas.map((l) => l.nombre)).toEqual([
      'PROC_INS_FAC_PROV_AG',
      'PROC_INS_DET_FAC_PROV_AG',
      'PROC_INS_DET_FAC_PROV_AG',
      'PROC_INS_FIN_FAC_PROV_AG',
    ]);
    expect(llamadas.every((l) => l.transaccion.escritura)).toBe(true);
    expect(new Set(llamadas.map((l) => l.transaccion.numero)).size).toBe(1);
    expect(llamadas[0]!.parametros).toEqual([28, 1, 4, 132, 'A-0001-00000135', '2026-10-24', '2026-10-24', '2026-10-24', '2026-10-24', 3, 2, 4, 3, null]);
    expect(llamadas[1]!.parametros).toEqual([16330, 1, 'CON-5', 121000, 2]);
    expect(llamadas[2]!.parametros).toEqual([16330, 2, 'CON-33', 50000, 2]);
    expect(llamadas[3]!.parametros).toEqual([16330, 28]);
  });

  it('mapea la respuesta con las cuotas desde las filas del cierre', async () => {
    const { resultado } = await registrar(base());
    expect(resultado.structuredContent).toEqual({
      comprobanteId: 16330,
      numero: 'A-0001-00000135',
      numeroInterno: 20261000012,
      proveedor: { id: 4, nombre: 'TELECOM ARGENTINA S.A' },
      fecha: '2026-10-24',
      total: 171000,
      cuotas: [
        { cuota: 1, vencimiento: '2026-11-03', monto: 100000 },
        { cuota: 2, vencimiento: '2026-12-03', monto: 71000 },
      ],
    });
  });

  it('RESULTADO = 0 en la segunda línea → error y sin llamada al cierre', async () => {
    const { resultado, llamadas } = await registrar(
      base({
        PROC_INS_DET_FAC_PROV_AG: ([, orden]) =>
          orden === 2 ? [{ RESULTADO: 0, MENSAJE_ERROR: 'No existe el artículo CON-33' }] : [{}],
      }),
    );
    expect(resultado.structuredContent).toEqual({ error: { codigo: 'PARAMETRO_INVALIDO', mensaje: 'No existe el artículo CON-33' } });
    expect(llamadas.map((l) => l.nombre)).not.toContain('PROC_INS_FIN_FAC_PROV_AG');
  });

  it('prefijo COMPROBANTE_DUPLICADO: → ese código', async () => {
    const { resultado, llamadas } = await registrar(
      base({ PROC_INS_FAC_PROV_AG: () => [{ RESULTADO: 0, MENSAJE_ERROR: 'COMPROBANTE_DUPLICADO: Ya se ha cargado el comprobante' }] }),
    );
    expect(resultado.structuredContent).toEqual({ error: { codigo: 'COMPROBANTE_DUPLICADO', mensaje: 'Ya se ha cargado el comprobante' } });
    expect(llamadas).toHaveLength(1);
  });

  it('prefijo PERIODO_CERRADO: → ese código', async () => {
    const { resultado } = await registrar(
      base({ PROC_INS_FAC_PROV_AG: () => [{ RESULTADO: 0, MENSAJE_ERROR: 'PERIODO_CERRADO: La fecha contable cae en un período cerrado' }] }),
    );
    expect(resultado.structuredContent).toMatchObject({ error: { codigo: 'PERIODO_CERRADO' } });
  });

  it('valor fuera del perfil → PARAMETRO_INVALIDO que nombra el dato', async () => {
    const { resultado } = await registrar(
      base({ PROC_INS_FAC_PROV_AG: () => [{ RESULTADO: 0, MENSAJE_ERROR: 'La sucursal 1 no está en el perfil' }] }),
      { ...BORRADOR, sucursalId: 1 },
    );
    expect(resultado.structuredContent).toEqual({ error: { codigo: 'PARAMETRO_INVALIDO', mensaje: 'La sucursal 1 no está en el perfil' } });
  });

  it('base de otro país (bloqueo no del dominio) → PARAMETRO_INVALIDO', async () => {
    const { resultado } = await registrar(
      base({ PROC_INS_FAC_PROV_AG: () => [{ RESULTADO: 0, MENSAJE_ERROR: 'BASE_NO_SOPORTADA: El prototipo solo registra facturas en bases de Argentina' }] }),
    );
    expect(resultado.structuredContent).toMatchObject({ error: { codigo: 'PARAMETRO_INVALIDO' } });
  });

  it('usuario sin perfil → NO_AUTORIZADO', async () => {
    const { resultado } = await registrar(
      base({ PROC_INS_FAC_PROV_AG: () => [{ RESULTADO: 0, MENSAJE_ERROR: 'NO_AUTORIZADO: el perfil no está asignado al usuario' }] }),
    );
    expect(resultado.structuredContent).toMatchObject({ error: { codigo: 'NO_AUTORIZADO' } });
  });

  it('un cierre sin filas es ERROR_INTERNO (y la transacción se revierte)', async () => {
    const { resultado } = await registrar(base({ PROC_INS_FIN_FAC_PROV_AG: () => [] }));
    expect(resultado.structuredContent).toMatchObject({ error: { codigo: 'ERROR_INTERNO' } });
  });

  it('no acepta texto libre ni números sin normalizar', async () => {
    for (const malo of [
      { ...BORRADOR, numero: 'A1 135' },
      { ...BORRADOR, proveedor: 'Telecom' },
      { ...BORRADOR, items: [{ articulo: 'Internet', monto: 1 }] },
      { ...BORRADOR, items: [{ articuloCodigo: 'CON-5', monto: 0 }] },
    ]) {
      const { resultado, llamadas } = await registrar(base(), malo);
      expect(resultado.structuredContent).toMatchObject({ error: { codigo: 'PARAMETRO_INVALIDO' } });
      expect(llamadas).toHaveLength(0);
    }
  });

  it('cuenta las llamadas a la base en el evento de invocación', async () => {
    const { eventos } = await registrar(base());
    expect(eventos.find((e) => e.evento === 'invocacion_tool')).toMatchObject({ tool: 'registrar_factura_proveedor', llamadasBase: 4 });
  });
});

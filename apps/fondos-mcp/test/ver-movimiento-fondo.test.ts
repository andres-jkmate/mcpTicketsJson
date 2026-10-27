import { describe, expect, it } from 'vitest';
import { relojDesdeTexto, type Fila } from '@mcp-jkmate/firebird';
import { crearVerMovimientoFondo, type DetalleMovimiento } from '../src/tools/ver-movimiento-fondo.js';
import { accesoSimulado, conectarCliente, SESION_PRUEBA, type ManejadorSp } from './apoyo.js';

const ZONA = 'America/Argentina/Buenos_Aires';

function cabecera(extra: Partial<Fila> = {}): Fila {
  return {
    COD_MOVIMIENTO_FONDO: 105007,
    NRO_COMPROBANTE: 'X-0001-00008556',
    TALONARIO: 'Orden de pago JK',
    TIPO: 'Pago a prove JKMT',
    CLASE: 'pago',
    FECHA: relojDesdeTexto('2026-10-13'),
    CONCEPTO: 'Pago a prove JKMT',
    TOTAL: 199230,
    ESTADO: 'vigente',
    NUM_CAJA: 1,
    USUARIO: 'ADMIN',
    CARGADO_POR: 'ADMIN',
    FECHA_HORA_CARGA: relojDesdeTexto('2026-10-13 10:22:05'),
    TERCERO_ROL: 'proveedor',
    TERCERO: 'TELECOM ARGENTINA S.A',
    TERCERO_DOCUMENTO: '30-63945373-8',
    REVERTIDO_POR: null,
    REVIERTE_A: null,
    COD_ASIENTO_CONTABLE: null,
    ...extra,
  };
}

function renglon(lado: 'D' | 'H', cuenta: string, importe: number, extra: Partial<Fila> = {}): Fila {
  return {
    LADO: lado,
    CUENTA: cuenta,
    IMPORTE: importe,
    LEYENDA: 'Pago a prove JKMT00008556',
    ES_FONDOS: 0,
    UNIDADES: importe,
    TERCERO: null,
    DOCUMENTO: null,
    CENTRO_COSTO: null,
    SUCURSAL: '   ',
    ...extra,
  };
}

async function ver(id: number, sps: { cabecera: ManejadorSp; renglones?: ManejadorSp; cheques?: ManejadorSp }) {
  const { acceso, llamadas } = accesoSimulado({
    PROC_GET_MOV_FONDO_AG: sps.cabecera,
    PROC_LIST_DET_MOV_FONDO_AG: sps.renglones ?? (() => []),
    PROC_LIST_CHEQUES_MOV_FON_AG: sps.cheques ?? (() => []),
  });
  const { cliente } = await conectarCliente([crearVerMovimientoFondo({ acceso, zonaHoraria: ZONA })]);
  await cliente.listTools(); // el cliente valida structuredContent contra el outputSchema
  const resultado = await cliente.callTool({ name: 'ver_movimiento_fondo', arguments: { id } });
  return { resultado, datos: resultado.structuredContent as unknown as DetalleMovimiento, llamadas };
}

describe('ver_movimiento_fondo', () => {
  it('pago en efectivo: debe Proveedores, haber Caja y el resumen dice que salió de Caja', async () => {
    const { resultado, datos, llamadas } = await ver(105007, {
      cabecera: () => [cabecera()],
      renglones: () => [renglon('D', 'Proveedores', 199230), renglon('H', 'Caja', 199230, { ES_FONDOS: 1 })],
    });
    expect(resultado.isError).toBeFalsy();
    expect(datos).toEqual({
      id: 105007,
      numero: 'X-0001-00008556',
      talonario: 'Orden de pago JK',
      tipo: 'Pago a prove JKMT',
      clase: 'pago',
      fecha: '2026-10-13',
      concepto: 'Pago a prove JKMT',
      total: 199230,
      estado: 'vigente',
      caja: 1,
      usuario: 'ADMIN',
      cargadoPor: 'ADMIN',
      cargadoEl: '2026-10-13T10:22:05-03:00',
      tercero: { rol: 'proveedor', nombre: 'TELECOM ARGENTINA S.A', documento: '30-63945373-8' },
      resumen: { entroA: [], salioDe: [{ cuenta: 'Caja', importe: 199230 }] },
      debe: [{ cuenta: 'Proveedores', importe: 199230, leyenda: 'Pago a prove JKMT00008556', esFondos: false }],
      haber: [{ cuenta: 'Caja', importe: 199230, leyenda: 'Pago a prove JKMT00008556', esFondos: true }],
      cheques: [],
      relacionados: { revertidoPor: null, revierteA: null, asientoContable: null },
    });
    // Una sola transacción de solo lectura, con los tres SP en orden.
    expect(llamadas).toEqual([
      { nombre: 'PROC_GET_MOV_FONDO_AG', parametros: [SESION_PRUEBA.codUsuario, 105007], escritura: false },
      { nombre: 'PROC_LIST_DET_MOV_FONDO_AG', parametros: [105007], escritura: false },
      { nombre: 'PROC_LIST_CHEQUES_MOV_FON_AG', parametros: [105007], escritura: false },
    ]);
  });

  it('id inexistente → MOVIMIENTO_NO_ENCONTRADO, sin llamar a renglones ni cheques', async () => {
    const { resultado, llamadas } = await ver(999999999, {
      cabecera: () => [{ RESULTADO: 0, MENSAJE_ERROR: 'MOVIMIENTO_NO_ENCONTRADO: no existe el movimiento de fondos 999999999' }],
    });
    expect(resultado.isError).toBe(true);
    expect(resultado.structuredContent).toEqual({
      error: { codigo: 'MOVIMIENTO_NO_ENCONTRADO', mensaje: 'no existe el movimiento de fondos 999999999' },
    });
    expect(llamadas.map((l) => l.nombre)).toEqual(['PROC_GET_MOV_FONDO_AG']);
  });

  it('usuario dado de baja → NO_AUTORIZADO', async () => {
    const { resultado } = await ver(105007, { cabecera: () => [{ RESULTADO: 0, MENSAJE_ERROR: 'NO_AUTORIZADO: el usuario configurado no existe o está dado de baja' }] });
    expect(resultado.structuredContent).toMatchObject({ error: { codigo: 'NO_AUTORIZADO' } });
  });

  it('reversión: clase reversion y revierteA apunta al original', async () => {
    const { datos } = await ver(104976, {
      cabecera: () => [cabecera({ COD_MOVIMIENTO_FONDO: 104976, CLASE: 'reversion', TIPO: 'Reversión de fondos', REVIERTE_A: 104870 })],
    });
    expect(datos).toMatchObject({ id: 104976, clase: 'reversion', estado: 'vigente', relacionados: { revertidoPor: null, revierteA: 104870 } });
  });

  it('movimiento revertido: estado revertido y revertidoPor', async () => {
    const { datos } = await ver(104870, { cabecera: () => [cabecera({ COD_MOVIMIENTO_FONDO: 104870, ESTADO: 'revertido', REVERTIDO_POR: 104976 })] });
    expect(datos).toMatchObject({ estado: 'revertido', relacionados: { revertidoPor: 104976, revierteA: null } });
  });

  it('moneda extranjera: unidades solo cuando difieren del importe; opcionales con dato; resumen agrupado por cuenta', async () => {
    const { datos } = await ver(105100, {
      cabecera: () => [cabecera({ TERCERO_ROL: null, TERCERO: null, TERCERO_DOCUMENTO: null, FECHA_HORA_CARGA: null })],
      renglones: () => [
        renglon('D', 'Banco Galicia USD', 1000000, { ES_FONDOS: 1, UNIDADES: 1000 }),
        renglon('D', 'Banco Galicia USD', 500000, { ES_FONDOS: 1, UNIDADES: 500 }),
        renglon('H', 'Deudores', 1500000, { TERCERO: 'ACME SA ', DOCUMENTO: '30-11111111-1', CENTRO_COSTO: 'Ventas', SUCURSAL: 'Central' }),
      ],
      cheques: () => [
        {
          BANCO: 'Galicia',
          SUCURSAL: null,
          NRO_CHEQUE: '00012345',
          TIPO_CHEQUE: 'Propio',
          ESTADO_CHEQUE: 'En cartera',
          IMPORTE: 1500000,
          FECHA_EMISION: relojDesdeTexto('2026-10-01'),
          FECHA_VENCIMIENTO: relojDesdeTexto('2026-11-01'),
          FECHA_COBRO: null,
        },
      ],
    });
    expect(datos.tercero).toBeNull();
    expect(datos.cargadoEl).toBeNull();
    expect(datos.debe).toEqual([
      { cuenta: 'Banco Galicia USD', importe: 1000000, leyenda: 'Pago a prove JKMT00008556', esFondos: true, unidades: 1000 },
      { cuenta: 'Banco Galicia USD', importe: 500000, leyenda: 'Pago a prove JKMT00008556', esFondos: true, unidades: 500 },
    ]);
    expect(datos.haber).toEqual([
      {
        cuenta: 'Deudores',
        importe: 1500000,
        leyenda: 'Pago a prove JKMT00008556',
        esFondos: false,
        tercero: 'ACME SA',
        documento: '30-11111111-1',
        centroCosto: 'Ventas',
        sucursal: 'Central',
      },
    ]);
    expect(datos.resumen).toEqual({ entroA: [{ cuenta: 'Banco Galicia USD', importe: 1500000 }], salioDe: [] });
    expect(datos.cheques).toEqual([
      {
        banco: 'Galicia',
        sucursal: null,
        numero: '00012345',
        tipo: 'Propio',
        estado: 'En cartera',
        importe: 1500000,
        emision: '2026-10-01',
        vencimiento: '2026-11-01',
        cobro: null,
      },
    ]);
  });

  it('id inválido → PARAMETRO_INVALIDO sin tocar la base', async () => {
    const { acceso, llamadas } = accesoSimulado({});
    const { cliente } = await conectarCliente([crearVerMovimientoFondo({ acceso, zonaHoraria: ZONA })]);
    const resultado = await cliente.callTool({ name: 'ver_movimiento_fondo', arguments: { id: 0 } });
    expect(resultado.structuredContent).toMatchObject({ error: { codigo: 'PARAMETRO_INVALIDO' } });
    expect(llamadas).toHaveLength(0);
  });
});

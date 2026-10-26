import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccesoDatos } from '@mcp-jkmate/firebird';
import { crearTools } from '../../src/tools/index.js';
import type { FacturaPreparada } from '../../src/tools/preparar-factura-proveedor.js';
import type { FacturaRegistrada } from '../../src/tools/registrar-factura-proveedor.js';
import { conectarCliente } from '../apoyo.js';
import { accesoDesdeEntorno, hayProcedimientosAg } from './base.js';

/*
 * Contra la copia local de CREAR con los SP aplicados. El usuario 28 tiene el perfil 1 GENERAL.
 * ATENCIÓN: el caso de registrar CONFIRMA una factura de prueba en la base (número único por
 * corrida, punto de venta 9999); se puede anular desde JK3.
 */
const hayAg = await hayProcedimientosAg();
const USUARIO = 28;

describe.skipIf(!hayAg)('factura de proveedor contra CREAR (integración)', () => {
  let acceso: AccesoDatos;
  let llamar: (name: string, args: Record<string, unknown>) => Promise<{ isError?: boolean; structuredContent?: unknown }>;

  beforeAll(async () => {
    acceso = accesoDesdeEntorno();
    const { cliente } = await conectarCliente(crearTools({ acceso }), { codUsuario: USUARIO });
    await cliente.listTools();
    llamar = (name, args) => cliente.callTool({ name, arguments: args }) as Promise<{ isError?: boolean; structuredContent?: unknown }>;
  });

  afterAll(async () => {
    await acceso?.cerrar();
  });

  it('"carga la factura A1 135 de Telecom de 200.000 por Internet"', async () => {
    const r = await llamar('preparar_factura_proveedor', { proveedor: 'Telecom', numero: 'A1 135', items: [{ articulo: 'Internet', monto: 200000 }] });
    expect(r.isError).toBeFalsy();
    const d = r.structuredContent as FacturaPreparada;
    const proveedor = d.pendientes.find((p) => p.campo === 'proveedor');
    expect(proveedor?.opciones.find((o) => o.sugerido)?.descripcion).toMatch(/TELECOM ARGENTINA/);
    expect(d.resueltos.numero?.id).toBe('A-0001-00000135');
    expect(d.resueltos.tipoComprobante?.id).toBe(132);
    expect(d.pendientes.find((p) => p.campo === 'moneda')?.opciones.map((o) => o.id).sort()).toEqual([3, 5]);
  });

  it('"carga 100.000 de honorarios para SOFUN": número y artículo pendientes', async () => {
    const r = await llamar('preparar_factura_proveedor', { proveedor: 'SOFUN', items: [{ articulo: 'honorarios', monto: 100000 }] });
    const d = r.structuredContent as FacturaPreparada;
    expect(d.pendientes.map((p) => p.campo)).toEqual(expect.arrayContaining(['numero', 'items[0].articulo']));
  });

  it('preparar no deja rastros en COMPROBANTES_PROVEEDORES ni en SEMI', async () => {
    const contar = async () =>
      acceso.consultar(
        'SELECT (SELECT COUNT(*) FROM COMPROBANTES_PROVEEDORES) AS C, (SELECT COUNT(*) FROM SEMI_COMPROBANTES_PROVEEDORES) AS S FROM RDB$DATABASE',
        [],
      );
    const antes = await contar();
    await llamar('preparar_factura_proveedor', { proveedorId: 4, numero: 'A1 135', monedaId: 3, items: [{ articulo: 'Internet', monto: 1000 }] });
    expect(await contar()).toEqual(antes);
  });

  it('registra una factura de prueba: comprobante, detalle, crédito y cuotas, sin filas en SEMI', async () => {
    const numero = `A 9999 ${String(Date.now() % 100_000_000)}`;
    const prep = (await llamar('preparar_factura_proveedor', { proveedorId: 4, numero, monedaId: 3, items: [{ articulo: 'Internet', monto: 1210 }] }))
      .structuredContent as FacturaPreparada;
    expect(prep.bloqueos).toEqual([]);
    expect(prep.listoParaRegistrar).toBe(true);

    const r = await llamar('registrar_factura_proveedor', prep.paraRegistrar as unknown as Record<string, unknown>);
    expect(r.isError).toBeFalsy();
    const f = r.structuredContent as FacturaRegistrada;
    console.info(`Factura de prueba registrada: comprobante ${f.comprobanteId}, número ${f.numero}`);
    expect(f.numero).toBe(prep.paraRegistrar!.numero);
    expect(f.cuotas.length).toBeGreaterThan(0);

    const [fila] = await acceso.consultar(
      `SELECT C.COD_USUARIO,
              (SELECT COUNT(*) FROM DET_COMPROBANTES_PROVEEDORES D WHERE D.COD_COMPROBANTE_PROVEEDOR = C.COD_COMPROBANTE_PROVEEDOR) AS DET,
              (SELECT COUNT(*) FROM CREDITOS_PROVEEDORES K WHERE K.COD_COMPROBANTE_PROVEEDOR = C.COD_COMPROBANTE_PROVEEDOR) AS CRED,
              (SELECT COUNT(*) FROM SEMI_COMPROBANTES_PROVEEDORES S WHERE S.COD_COMPROBANTE_PROVEEDOR = C.COD_COMPROBANTE_PROVEEDOR) AS SEMI
       FROM COMPROBANTES_PROVEEDORES C WHERE C.COD_COMPROBANTE_PROVEEDOR = ?`,
      [f.comprobanteId],
    );
    expect(fila).toMatchObject({ COD_USUARIO: USUARIO, DET: 1, CRED: 1, SEMI: 0 });

    // Repetirla es COMPROBANTE_DUPLICADO y no graba nada.
    const otra = await llamar('registrar_factura_proveedor', prep.paraRegistrar as unknown as Record<string, unknown>);
    expect(otra.structuredContent).toMatchObject({ error: { codigo: 'COMPROBANTE_DUPLICADO' } });
  });
});

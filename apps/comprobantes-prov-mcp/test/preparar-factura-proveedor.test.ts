import { describe, expect, it } from 'vitest';
import type { Fila } from '@mcp-jkmate/firebird';
import { crearPrepararFacturaProveedor, type FacturaPreparada } from '../src/tools/preparar-factura-proveedor.js';
import { accesoSimulado, conectarCliente } from './apoyo.js';
import { baseCrear } from './datos/crear.js';

const HOY = '2026-10-24';

async function preparar(argumentos: Record<string, unknown>, opciones: { extraPerfil?: Fila[]; cerradoHasta?: string; codUsuario?: number } = {}) {
  const { acceso, llamadas } = accesoSimulado(baseCrear(opciones));
  const { cliente } = await conectarCliente(
    [crearPrepararFacturaProveedor({ acceso, hoy: () => HOY })],
    opciones.codUsuario ? { codUsuario: opciones.codUsuario } : undefined,
  );
  await cliente.listTools(); // el cliente valida structuredContent contra el outputSchema
  const resultado = await cliente.callTool({ name: 'preparar_factura_proveedor', arguments: argumentos });
  return { resultado, datos: resultado.structuredContent as unknown as FacturaPreparada, llamadas };
}

const pendiente = (d: FacturaPreparada, campo: string) => d.pendientes.find((p) => p.campo === campo);

/** Borrador completo de Telecom Argentina (proveedor y moneda ya elegidos). */
const COMPLETO = { proveedorId: 4, numero: 'A1 135', monedaId: 3, items: [{ articulo: 'Internet', monto: 121000 }] };

describe('preparar_factura_proveedor', () => {
  it('ejemplo del design: Telecom ambiguo con sugerencia, número normalizado, tipo por letra, moneda pendiente', async () => {
    const { resultado, datos } = await preparar({ proveedor: 'Telecom', numero: 'A1 135', items: [{ articulo: 'Internet', monto: 200000 }] });
    expect(resultado.isError).toBeFalsy();
    expect(datos.listoParaRegistrar).toBe(false);
    expect(datos.resueltos).toMatchObject({
      perfil: { id: 1, descripcion: 'GENERAL', origen: 'unico' },
      numero: { id: 'A-0001-00000135', origen: 'informado' },
      tipoComprobante: { id: 132, origen: 'letra' },
      sucursal: { id: 3, origen: 'unico' },
      centroCosto: { id: 2, origen: 'unico' },
      condicionCompra: { id: 4, origen: 'unico' },
    });
    expect(pendiente(datos, 'proveedor')).toEqual({
      campo: 'proveedor',
      texto: 'Telecom',
      motivo: 'Hay 2 proveedores que coinciden',
      opciones: [
        { id: 4, descripcion: 'TELECOM ARGENTINA S.A', sugerido: true, motivoSugerencia: 'Tiene INTERNET 21% en su plantilla' },
        { id: 2, descripcion: 'TELECOM PERSONAL S.A.', sugerido: false, motivoSugerencia: null },
      ],
    });
    expect(pendiente(datos, 'moneda')?.opciones.map((o) => o.id)).toEqual([3, 5]);
    expect(datos.items).toEqual([{ orden: 1, texto: 'Internet', monto: 200000, articulo: null, calculado: null }]);
    expect(datos).toMatchObject({ totalCalculado: null, vencimiento: null, paraRegistrar: null, bloqueos: [] });
  });

  it('pedido incompleto: no es error, queda el número pendiente', async () => {
    const { resultado, datos } = await preparar({ proveedor: 'SOFUN', items: [{ articulo: 'honorarios', monto: 100000 }] });
    expect(resultado.isError).toBeFalsy();
    expect(datos.listoParaRegistrar).toBe(false);
    expect(pendiente(datos, 'numero')).toMatchObject({ motivo: 'Falta el número de la factura' });
    expect(datos.resueltos.proveedor).toEqual({ id: 10, descripcion: 'SOFUN SRL', origen: 'informado' });
    // Sin plantilla ni historial: tres honorarios del catálogo.
    expect(pendiente(datos, 'items[0].articulo')?.opciones.map((o) => o.id)).toEqual(['CON-10', 'CON-11', 'CON-12']);
  });

  it('ítem agregado en otro turno: muestra las dos líneas y el total de ambas', async () => {
    const { datos } = await preparar({
      ...COMPLETO,
      items: [
        { articulo: 'Internet', monto: 121000 },
        { articulo: 'gastos varios', monto: 50000 },
      ],
    });
    expect(datos.items.map((i) => i.articulo?.codigo)).toEqual(['CON-5', 'CON-33']);
    expect(datos.items.every((i) => i.calculado)).toBe(true);
    expect(datos.totalCalculado).toBe(171000);
  });

  it('dato resuelto: el perfil con una sola sucursal la resuelve con origen unico', async () => {
    const { datos } = await preparar(COMPLETO);
    expect(datos.resueltos.sucursal).toEqual({ id: 3, descripcion: 'Christian', origen: 'unico' });
  });

  it('usuario sin perfil → NO_AUTORIZADO', async () => {
    const { resultado } = await preparar(COMPLETO, { codUsuario: 99 });
    expect(resultado.isError).toBe(true);
    expect(resultado.structuredContent).toMatchObject({ error: { codigo: 'NO_AUTORIZADO' } });
  });

  it('número abreviado → A-0001-00000135; número inválido → pendiente', async () => {
    expect((await preparar(COMPLETO)).datos.resueltos.numero?.id).toBe('A-0001-00000135');
    const { datos } = await preparar({ ...COMPLETO, numero: 'E 1 135' });
    expect(pendiente(datos, 'numero')).toMatchObject({ texto: 'E 1 135', motivo: expect.stringMatching(/letra E/) });
    expect(pendiente(datos, 'tipoComprobante')).toBeDefined();
  });

  it('línea gravada: 121000 → neto 100000 e IVA 21000; borrador completo con paraRegistrar', async () => {
    const { datos } = await preparar(COMPLETO);
    expect(datos.items[0]).toEqual({
      orden: 1,
      texto: 'Internet',
      monto: 121000,
      articulo: { codigo: 'CON-5', descripcion: 'INTERNET 21%', origen: 'plantilla_proveedor' },
      calculado: { neto: 100000, noGravado: 0, exento: 0, iva: 21000, impuesto: 0, percepciones: 0 },
    });
    expect(datos.totalCalculado).toBe(121000);
    expect(datos.listoParaRegistrar).toBe(true);
    expect(datos.pendientes).toEqual([]);
    expect(datos.vencimiento).toBe('2026-11-03');
    expect(datos.paraRegistrar).toEqual({
      proveedorId: 4,
      perfilId: 1,
      tipoComprobanteId: 132,
      numero: 'A-0001-00000135',
      fecha: HOY,
      fechaRecepcion: HOY,
      fechaContable: HOY,
      fechaIva: HOY,
      sucursalId: 3,
      centroCostoId: 2,
      condicionCompraId: 4,
      monedaId: 3,
      items: [{ articuloCodigo: 'CON-5', monto: 121000 }],
    });
  });

  it('sin fechas: todas quedan en hoy, con origen hoy la del comprobante', async () => {
    const { datos } = await preparar(COMPLETO);
    expect(datos.resueltos).toMatchObject({
      fecha: { id: HOY, origen: 'hoy' },
      fechaRecepcion: { id: HOY, origen: 'calculado' },
      fechaContable: { id: HOY, origen: 'calculado' },
      fechaIva: { id: HOY, origen: 'calculado' },
    });
  });

  it('condición de contado: bloqueo y no está listo', async () => {
    const contado = { CAMPO: 'condicionCompra', CODIGO: 6, DESCRIPCION: 'CONTADO', POR_DEFECTO: 0, LETRA: null, MODALIDAD: 'Contado' };
    const { datos } = await preparar({ ...COMPLETO, condicionCompraId: 6 }, { extraPerfil: [contado] });
    expect(datos.bloqueos).toContainEqual(expect.objectContaining({ codigo: 'CONDICION_NO_CUENTA_CORRIENTE' }));
    expect(datos.listoParaRegistrar).toBe(false);
    expect(datos.paraRegistrar).toBeNull();
  });

  it('período cerrado: bloqueo PERIODO_CERRADO', async () => {
    const { datos } = await preparar({ ...COMPLETO, fecha: '2026-09-15' }, { cerradoHasta: '2026-09-30' });
    expect(datos.bloqueos).toContainEqual(expect.objectContaining({ codigo: 'PERIODO_CERRADO' }));
    expect(datos.listoParaRegistrar).toBe(false);
  });

  it('un valor informado fuera del perfil es un bloqueo y deja el dato pendiente con las opciones', async () => {
    const { datos } = await preparar({ ...COMPLETO, sucursalId: 1 });
    expect(datos.bloqueos).toContainEqual(expect.objectContaining({ codigo: 'FUERA_DEL_PERFIL' }));
    expect(pendiente(datos, 'sucursal')?.opciones.map((o) => o.id)).toEqual([3]);
    expect(datos.resueltos.sucursal).toBeUndefined();
  });

  it('una opción por defecto del perfil se usa con origen por_defecto', async () => {
    const dolarPorDefecto = { CAMPO: 'moneda', CODIGO: 7, DESCRIPCION: 'EUROS', POR_DEFECTO: 1, LETRA: null, MODALIDAD: null };
    const { datos } = await preparar({ ...COMPLETO, monedaId: undefined }, { extraPerfil: [dolarPorDefecto] });
    expect(datos.resueltos.moneda).toEqual({ id: 7, descripcion: 'EUROS', origen: 'por_defecto' });
  });

  it('cada dato aparece en resueltos o en pendientes, nunca en los dos', async () => {
    const { datos } = await preparar({ proveedor: 'Telecom', items: [{ articulo: 'Internet', monto: 1 }] });
    const campos = ['proveedor', 'perfil', 'tipoComprobante', 'numero', 'fecha', 'fechaRecepcion', 'fechaContable', 'fechaIva', 'sucursal', 'centroCosto', 'condicionCompra', 'moneda'];
    for (const c of campos) expect(Number(c in datos.resueltos) + Number(Boolean(pendiente(datos, c)))).toBe(1);
  });

  it('no usa la transacción de escritura y todo va en una sola transacción de lectura', async () => {
    const { llamadas } = await preparar(COMPLETO);
    expect(llamadas.length).toBeGreaterThan(0);
    expect(llamadas.every((l) => !l.transaccion.escritura)).toBe(true);
    expect(new Set(llamadas.map((l) => l.transaccion.numero)).size).toBe(1);
  });

  it('el usuario de la sesión va al SP del perfil, no un parámetro', async () => {
    const { llamadas } = await preparar(COMPLETO);
    expect(llamadas[0]).toMatchObject({ nombre: 'PROC_LIST_PERFIL_OPC_AG', parametros: [28, null] });
  });

  it('un ítem sin artículo ni código es PARAMETRO_INVALIDO', async () => {
    const { resultado } = await preparar({ ...COMPLETO, items: [{ monto: 10 }] });
    expect(resultado.structuredContent).toMatchObject({ error: { codigo: 'PARAMETRO_INVALIDO' } });
  });
});

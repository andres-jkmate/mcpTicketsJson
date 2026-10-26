import { describe, expect, it } from 'vitest';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { problemasDeDescripcion } from '@mcp-jkmate/core/pruebas';
import { CODIGOS_ERROR } from '../src/errores.js';
import { NOMBRE_SERVIDOR } from '../src/servidor.js';
import { crearTools } from '../src/tools/index.js';
import { accesoSimulado, conectarCliente } from './apoyo.js';

async function conectar() {
  const { acceso, llamadas } = accesoSimulado({});
  const { cliente } = await conectarCliente(crearTools({ acceso }));
  const { tools } = await cliente.listTools();
  return { cliente, tools, llamadas };
}

describe('contrato de las tools', () => {
  it('el servidor se identifica con su nombre en el handshake', async () => {
    const { cliente } = await conectar();
    expect(cliente.getServerVersion()?.name).toBe(NOMBRE_SERVIDOR);
    expect(NOMBRE_SERVIDOR).toBe('mcp-comprobantes-prov');
  });

  it('tools/list publica exactamente preparar y registrar, con nombres verbo_sustantivo en español', async () => {
    const { tools } = await conectar();
    expect(tools.map((t) => t.name)).toEqual(['preparar_factura_proveedor', 'registrar_factura_proveedor']);
    for (const t of tools) expect(t.name).toMatch(/^[a-z]+(_[a-z]+)+$/);
  });

  it('cada descripción sigue la plantilla (qué hace, cuándo usarla, parámetros con ejemplo, qué NO hacer)', async () => {
    const { tools } = await conectar();
    expect(problemasDeDescripcion(tools)).toEqual([]);
  });

  it('registrar pide en su descripción la vista previa y la confirmación del usuario', async () => {
    const { tools } = await conectar();
    const registrar = tools.find((t) => t.name === 'registrar_factura_proveedor')!;
    expect(registrar.description).toMatch(/^Qué NO hacer: no la llames sin haber mostrado la vista previa de preparar_factura_proveedor y tener la confirmación/m);
  });

  it('annotations según el spec', async () => {
    const { tools } = await conectar();
    const porNombre = Object.fromEntries(tools.map((t) => [t.name, t.annotations]));
    expect(porNombre.preparar_factura_proveedor).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    expect(porNombre.registrar_factura_proveedor).toEqual({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false });
  });

  it('cada tool declara un inputSchema cerrado y un outputSchema con los seis códigos del servidor', async () => {
    const { tools } = await conectar();
    expect(CODIGOS_ERROR).toEqual([
      'PARAMETRO_INVALIDO',
      'NO_AUTORIZADO',
      'BASE_NO_DISPONIBLE',
      'ERROR_INTERNO',
      'COMPROBANTE_DUPLICADO',
      'PERIODO_CERRADO',
    ]);
    for (const t of tools) {
      expect(t.inputSchema).toMatchObject({ additionalProperties: false });
      expect(t.outputSchema).toMatchObject({ properties: { error: { properties: { codigo: { enum: [...CODIGOS_ERROR] } } } } });
    }
  });

  it('un input inválido responde PARAMETRO_INVALIDO sin tocar la base', async () => {
    const { cliente, llamadas } = await conectar();
    for (const name of ['preparar_factura_proveedor', 'registrar_factura_proveedor']) {
      const resultado = await cliente.callTool({ name, arguments: { items: [], extra: 1 } });
      expect(resultado.isError).toBe(true);
      expect(resultado.structuredContent).toMatchObject({ error: { codigo: 'PARAMETRO_INVALIDO' } });
    }
    expect(llamadas).toHaveLength(0);
  });

  it('la tool de ejemplo de la plantilla no existe: llamarla es un error de protocolo', async () => {
    const { cliente } = await conectar();
    await expect(cliente.callTool({ name: 'obtener_ejemplo', arguments: { ejemploId: 1 } })).rejects.toMatchObject({
      code: ErrorCode.InvalidParams,
      message: expect.stringContaining('Tool desconocida: obtener_ejemplo'),
    });
  });
});

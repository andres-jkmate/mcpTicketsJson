import { describe, expect, it } from 'vitest';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { problemasDeDescripcion } from '@mcp-jkmate/core/pruebas';
import { CODIGOS_ERROR } from '../src/errores.js';
import { NOMBRE_SERVIDOR } from '../src/servidor.js';
import { crearTools } from '../src/tools/index.js';
import { accesoSimulado, conectarCliente, type ManejadorSp } from './apoyo.js';

async function conectar(manejadores: Record<string, ManejadorSp> = {}) {
  const { acceso, llamadas } = accesoSimulado(manejadores);
  const { cliente } = await conectarCliente(crearTools({ acceso, hoy: () => '2026-10-26', zonaHoraria: 'America/Argentina/Buenos_Aires' }));
  const { tools } = await cliente.listTools();
  return { cliente, tools, llamadas };
}

describe('contrato de las tools', () => {
  it('el servidor se identifica con su nombre en el handshake', async () => {
    const { cliente } = await conectar();
    expect(cliente.getServerVersion()?.name).toBe(NOMBRE_SERVIDOR);
    expect(NOMBRE_SERVIDOR).toBe('mcp-fondos');
  });

  it('tools/list publica exactamente buscar y ver, con nombres verbo_sustantivo en español', async () => {
    const { tools } = await conectar();
    expect(tools.map((t) => t.name)).toEqual(['buscar_movimientos_fondos', 'ver_movimiento_fondo']);
    for (const t of tools) expect(t.name).toMatch(/^[a-z]+(_[a-z]+)+$/);
  });

  it('cada descripción sigue la plantilla (qué hace, cuándo usarla, parámetros con ejemplo, qué NO hacer)', async () => {
    const { tools } = await conectar();
    expect(problemasDeDescripcion(tools)).toEqual([]);
  });

  it('las dos son de solo lectura', async () => {
    const { tools } = await conectar();
    for (const t of tools) {
      expect(t.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    }
  });

  it('cada tool declara un inputSchema cerrado y un outputSchema con los códigos del servidor', async () => {
    const { tools } = await conectar();
    expect(CODIGOS_ERROR).toEqual(['PARAMETRO_INVALIDO', 'NO_AUTORIZADO', 'BASE_NO_DISPONIBLE', 'ERROR_INTERNO', 'MOVIMIENTO_NO_ENCONTRADO']);
    for (const t of tools) {
      expect(t.inputSchema).toMatchObject({ additionalProperties: false });
      expect(t.outputSchema).toMatchObject({ properties: { error: { properties: { codigo: { enum: [...CODIGOS_ERROR] } } } } });
    }
  });

  it('un input inválido responde PARAMETRO_INVALIDO sin tocar la base', async () => {
    const { cliente, llamadas } = await conectar();
    for (const [name, args] of [
      ['buscar_movimientos_fondos', { extra: 1 }],
      ['ver_movimiento_fondo', { id: 'uno' }],
    ] as const) {
      const resultado = await cliente.callTool({ name, arguments: args });
      expect(resultado.isError).toBe(true);
      expect(resultado.structuredContent).toMatchObject({ error: { codigo: 'PARAMETRO_INVALIDO' } });
    }
    expect(llamadas).toHaveLength(0);
  });

  it('un input válido se acepta y la respuesta cumple el outputSchema', async () => {
    const { cliente } = await conectar({ PROC_LIST_MOV_FONDOS_AG: () => [] });
    const resultado = await cliente.callTool({ name: 'buscar_movimientos_fondos', arguments: {} });
    expect(resultado.isError).toBeFalsy();
    expect(resultado.structuredContent).toEqual({
      criterio: { numero: null, fechaDesde: '2026-09-26', fechaHasta: '2026-10-26', importeMin: null, importeMax: null, clase: null, tercero: null },
      encontrados: 0,
      desde: 0,
      truncado: false,
      movimientos: [],
    });
  });

  it('la tool de ejemplo de la plantilla no existe: llamarla es un error de protocolo', async () => {
    const { cliente } = await conectar();
    await expect(cliente.callTool({ name: 'obtener_ejemplo', arguments: { ejemploId: 1 } })).rejects.toMatchObject({
      code: ErrorCode.InvalidParams,
      message: expect.stringContaining('Tool desconocida: obtener_ejemplo'),
    });
  });
});

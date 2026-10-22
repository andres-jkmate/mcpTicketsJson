import { describe, expect, it } from 'vitest';
import { problemasDeDescripcion } from '@mcp-jkmate/core/pruebas';
import { CODIGOS_ERROR } from '../src/errores.js';
import { crearTools } from '../src/tools/index.js';
import { accesoSimulado, conectarCliente } from './apoyo.js';

async function conectar() {
  const { acceso } = accesoSimulado({
    PROC_GET_EJEMPLO_AG: () => [{ COD_EJEMPLO: 1, NOMBRE: 'Uno', ACTIVO: 0, FECHA_ALTA: new Date(Date.UTC(2026, 0, 2)) }],
  });
  const { cliente } = await conectarCliente(crearTools({ acceso }));
  const { tools } = await cliente.listTools();
  return { cliente, tools };
}

describe('contrato de las tools', () => {
  it('tools/list publica las tools con nombres verbo_sustantivo en español', async () => {
    const { tools } = await conectar();
    expect(tools.map((t) => t.name)).toEqual(['obtener_ejemplo']);
    for (const t of tools) expect(t.name).toMatch(/^[a-z]+(_[a-z]+)+$/);
  });

  it('cada descripción sigue la plantilla (qué hace, cuándo usarla, parámetros con ejemplo, qué NO hacer)', async () => {
    const { tools } = await conectar();
    expect(problemasDeDescripcion(tools)).toEqual([]);
  });

  it('cada tool declara annotations, un inputSchema cerrado y un outputSchema con los códigos del servidor', async () => {
    const { tools } = await conectar();
    for (const t of tools) {
      expect(t.annotations).toBeDefined();
      expect(t.inputSchema).toMatchObject({ additionalProperties: false });
      expect(t.outputSchema).toMatchObject({ properties: { error: { properties: { codigo: { enum: [...CODIGOS_ERROR] } } } } });
    }
  });

  it('un input inválido se rechaza con PARAMETRO_INVALIDO', async () => {
    const { cliente } = await conectar();
    const resultado = await cliente.callTool({ name: 'obtener_ejemplo', arguments: { ejemploId: 'uno' } });
    expect(resultado.isError).toBe(true);
    expect(resultado.structuredContent).toMatchObject({ error: { codigo: 'PARAMETRO_INVALIDO' } });
  });

  it('un input válido se acepta y la respuesta cumple el outputSchema', async () => {
    const { cliente } = await conectar();
    const resultado = await cliente.callTool({ name: 'obtener_ejemplo', arguments: { ejemploId: 1 } });
    expect(resultado.isError).toBeFalsy();
    expect(resultado.structuredContent).toEqual({ ejemplo: { id: 1, nombre: 'Uno', activo: false, fechaAlta: '2026-01-02' } });
  });
});

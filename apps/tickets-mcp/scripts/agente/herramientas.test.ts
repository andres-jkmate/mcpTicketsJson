import { describe, expect, it } from 'vitest';
import { aToolsModelo, caracteresTools, medirTools, type ToolMcp } from './herramientas.js';

const publicadas = [
  { name: 'listar_tickets', description: 'Lista', inputSchema: { type: 'object', properties: {} }, outputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'detalle_ticket', description: 'Detalle', inputSchema: { type: 'object', properties: { id: { type: 'integer' } } }, outputSchema: { type: 'object' } },
] as unknown as ToolMcp[];
const agregada = { name: 'crear_tarea', description: 'Crea', input_schema: { type: 'object' as const, properties: {} } };

describe('conversión de tools', () => {
  it('pasa solo name, description e input_schema (no llega outputSchema ni annotations)', () => {
    for (const t of aToolsModelo(publicadas)) expect(Object.keys(t).sort()).toEqual(['description', 'input_schema', 'name']);
  });

  it('ordena por nombre de forma estable, con las agregadas de la v2', () => {
    const a = aToolsModelo(publicadas, [agregada]).map((t) => t.name);
    const b = aToolsModelo([...publicadas].reverse(), [agregada]).map((t) => t.name);
    expect(a).toEqual(['crear_tarea', 'detalle_ticket', 'listar_tickets']);
    expect(b).toEqual(a);
  });

  it('rechaza una tool repetida', () => {
    expect(() => aToolsModelo(publicadas, [{ ...agregada, name: 'listar_tickets' }])).toThrow(/dos veces/);
  });

  it('mide caracteres y tokens (con tools − sin tools)', async () => {
    const tools = aToolsModelo(publicadas);
    const cliente = {
      messages: { countTokens: async (p: { tools?: unknown[] }) => ({ input_tokens: p.tools ? 130 : 10 }) },
    } as never;
    expect(await medirTools(cliente, 'claude-opus-5-5', tools)).toEqual({ cantidad: 2, caracteres: caracteresTools(tools), tokens: 120 });
  });
});

import { describe, expect, it } from 'vitest';
import { crearTools } from '../src/tools/index.js';
import { accesoSimulado, conectarCliente } from './apoyo.js';

async function listarTools() {
  const { acceso } = accesoSimulado({});
  const { cliente } = await conectarCliente(crearTools({ acceso, zonaHoraria: 'America/Argentina/Buenos_Aires' }));
  return (await cliente.listTools()).tools;
}

/** Junta todos los $ref de un schema. */
function refs(valor: unknown, acumulado: string[] = []): string[] {
  if (Array.isArray(valor)) valor.forEach((v) => refs(v, acumulado));
  else if (valor && typeof valor === 'object') {
    for (const [k, v] of Object.entries(valor)) {
      if (k === '$ref' && typeof v === 'string') acumulado.push(v);
      else refs(v, acumulado);
    }
  }
  return acumulado;
}

describe('contrato común de las tools', () => {
  it('publica las 4 tools con nombres verbo_sustantivo en español', async () => {
    const tools = await listarTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['listar_tareas', 'listar_tickets', 'obtener_contexto_ticket', 'resumir_tickets']);
  });

  it('todas son de lectura según sus annotations', async () => {
    for (const t of await listarTools()) {
      expect(t.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    }
  });

  it('ningún inputSchema declara un parámetro que represente al usuario que llama', async () => {
    for (const t of await listarTools()) {
      const nombres = Object.keys(t.inputSchema.properties ?? {});
      expect(nombres.filter((n) => /usuario|sesion|session|token/i.test(n))).toEqual([]);
      expect(t.inputSchema).toMatchObject({ additionalProperties: false });
    }
  });

  it('todo outputSchema admite la forma de error y resuelve sus $ref', async () => {
    for (const t of await listarTools()) {
      const schema = t.outputSchema as Record<string, unknown> & { properties: Record<string, unknown>; $defs?: Record<string, unknown> };
      expect(schema.properties.error).toBeDefined();
      expect(schema.anyOf).toContainEqual({ required: ['error'] });
      for (const ref of [...refs(schema), ...refs(t.inputSchema)]) {
        const nombre = ref.replace('#/$defs/', '');
        const defs = (ref.startsWith('#/$defs/') && (schema.$defs ?? (t.inputSchema as { $defs?: object }).$defs)) || {};
        expect(Object.keys(defs), `${t.name}: ${ref}`).toContain(nombre);
      }
    }
  });

  it('las descripciones orientan al agente', async () => {
    for (const t of await listarTools()) expect(t.description?.length).toBeGreaterThan(80);
  });
});

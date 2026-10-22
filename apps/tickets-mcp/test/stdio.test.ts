import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js';
import { hayProcedimientosAg } from './integracion/base.js';

const RAIZ = resolve(import.meta.dirname, '..');
// Con workspaces, node_modules queda en la raíz del monorepo: se resuelve como lo haría node.
const TSX = createRequire(import.meta.url).resolve('tsx/cli');
const ENTRADA = resolve(RAIZ, 'src/index.ts');
/** Los paquetes del monorepo se cargan desde su código fuente, como en `npm run dev`. */
const ARGS_TSX = [TSX, '--conditions=@mcp-jkmate/source', ENTRADA];

/** Entorno mínimo para el proceso hijo: sin heredar FIREBIRD_* ni MCP_* del entorno del test. */
function entornoBase(): Record<string, string> {
  const { PATH, Path, SystemRoot, TEMP, TMP } = process.env;
  return Object.fromEntries(Object.entries({ PATH, Path, SystemRoot, TEMP, TMP }).filter(([, v]) => v !== undefined)) as Record<string, string>;
}

describe('transporte stdio', () => {
  it('el JSON del wire no escapa caracteres no ASCII', () => {
    const linea = serializeMessage({
      jsonrpc: '2.0',
      id: 1,
      result: { content: [{ type: 'text', text: 'configuración' }], structuredContent: { texto: 'configuración' } },
    });
    expect(linea).toContain('configuración');
    expect(linea).not.toMatch(/\\u00[0-9a-f]{2}/i);
  });

  it('sin configuración falla con un mensaje claro en stderr y no escribe en stdout', () => {
    const r = spawnSync(process.execPath, ARGS_TSX, { env: entornoBase(), encoding: 'utf8', timeout: 30_000 });
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('MCP_COD_USUARIO');
    expect(r.stderr).toContain('FIREBIRD_DATABASE');
  });
});

const hayAg = await hayProcedimientosAg();

describe.skipIf(!hayAg)('sesión real por stdio (como la lanza Claude Desktop)', () => {
  it('lista las 4 tools y resuelve el contexto del #74836 con la identidad del entorno', { timeout: 60_000 }, async () => {
    const env = process.env;
    const transporte = new StdioClientTransport({
      command: process.execPath,
      args: ARGS_TSX,
      env: {
        ...entornoBase(),
        MCP_COD_USUARIO: '15169',
        FIREBIRD_HOST: env.FIREBIRD_HOST ?? '127.0.0.1',
        FIREBIRD_PORT: env.FIREBIRD_PORT ?? '3050',
        FIREBIRD_DATABASE: env.FIREBIRD_DATABASE ?? '',
        FIREBIRD_USER: env.FIREBIRD_USER ?? 'SYSDBA',
        FIREBIRD_PASSWORD: env.FIREBIRD_PASSWORD ?? '',
        LOG_LEVEL: 'info',
      },
      stderr: 'pipe',
    });
    const cliente = new Client({ name: 'test-stdio', version: '0.0.0' });
    await cliente.connect(transporte);
    try {
      const { tools } = await cliente.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(['listar_tareas', 'listar_tickets', 'obtener_contexto_ticket', 'resumir_tickets']);

      const contexto = await cliente.callTool({ name: 'obtener_contexto_ticket', arguments: { ticketId: 74836 } });
      expect(contexto.isError).toBeFalsy();
      expect(contexto.structuredContent).toMatchObject({ ticket: { id: 74836, asignadoA: { id: 15169 } } });

      // "yo" en tareas usa el desarrollador resuelto al arrancar (15169 → 100936)
      const tareas = await cliente.callTool({ name: 'listar_tareas', arguments: { soloPendientes: false, limite: 5 } });
      expect(tareas.isError).toBeFalsy();
      const lista = (tareas.structuredContent as { tareas: { desarrollador: { id: number } | null }[] }).tareas;
      expect(lista.every((t) => t.desarrollador?.id === 100936)).toBe(true);
    } finally {
      await cliente.close();
    }
  });
});

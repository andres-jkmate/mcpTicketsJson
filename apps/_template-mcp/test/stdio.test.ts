import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { NOMBRE_SERVIDOR } from '../src/servidor.js';

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

/** Configuración completa con una base que no existe: el pool no conecta hasta la primera tool. */
const CONFIG_COMPLETA = {
  MCP_COD_USUARIO: '15169',
  FIREBIRD_HOST: '127.0.0.1',
  FIREBIRD_PORT: '1',
  FIREBIRD_DATABASE: 'C:\\no\\existe.fdb',
  LOG_LEVEL: 'info',
};

describe('arranque por stdio', () => {
  it('sin MCP_COD_USUARIO falla con un mensaje claro en stderr y no escribe en stdout', () => {
    const { MCP_COD_USUARIO: _, ...sinUsuario } = CONFIG_COMPLETA;
    const r = spawnSync(process.execPath, ARGS_TSX, { env: { ...entornoBase(), ...sinUsuario }, encoding: 'utf8', timeout: 30_000 });
    expect(r.status).not.toBe(0);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('MCP_COD_USUARIO');
  });

  it('con la configuración completa queda esperando sin escribir en stdout y responde el handshake', { timeout: 60_000 }, async () => {
    const hijo = spawn(process.execPath, ARGS_TSX, { env: { ...entornoBase(), ...CONFIG_COMPLETA }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    hijo.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
    hijo.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));
    const esperar = async (condicion: () => boolean, que: string) => {
      for (let i = 0; i < 300 && !condicion(); i++) await new Promise((r) => setTimeout(r, 100));
      if (!condicion()) throw new Error(`No llegó ${que}. stderr: ${stderr}`);
    };
    try {
      await esperar(() => stderr.includes(`${NOMBRE_SERVIDOR} listo (stdio)`), 'el log de arranque');
      expect(stdout).toBe('');

      const initialize = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'test-stdio', version: '0.0.0' } },
      };
      hijo.stdin.write(`${JSON.stringify(initialize)}\n`);
      await esperar(() => stdout.includes('\n'), 'la respuesta del handshake');

      // Todo lo que sale por stdout es protocolo: un mensaje JSON-RPC por línea.
      const mensajes = stdout.trimEnd().split('\n').map((l) => JSON.parse(l) as { jsonrpc: string });
      expect(mensajes.every((m) => m.jsonrpc === '2.0')).toBe(true);
      expect(mensajes[0]).toMatchObject({ id: 1, result: { serverInfo: { name: NOMBRE_SERVIDOR } } });
    } finally {
      hijo.kill();
    }
  });
});

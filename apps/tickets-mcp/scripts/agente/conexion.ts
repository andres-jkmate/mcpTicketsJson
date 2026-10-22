/**
 * Conexión a la v1 (Streamable HTTP) y a la v2 (stdio), compartida por `medir-eficiencia.ts`
 * y por el arnés de medición con agente (design D10).
 *
 *   MEDICION_URL_V1, MEDICION_TOKEN_V1   endpoint y bearer de la v1
 *   La v2 se lanza por stdio (dist/index.js) con MCP_COD_USUARIO y FIREBIRD_* del entorno.
 */
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Llamador, RespuestaMedida } from '../medicion/estrategias.js';

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function requerido(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

/** Convierte un resultado de tools/call en tamaños. Los errores de protocolo cuentan como error. */
export function medirResultado(crudo: unknown): RespuestaMedida {
  const resultado = crudo as { content?: unknown; structuredContent?: unknown; isError?: unknown };
  const bloques = Array.isArray(resultado.content) ? (resultado.content as { type: string; text?: string }[]) : [];
  const texto = bloques.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
  return {
    texto,
    caracteresTexto: texto.length,
    caracteresEstructurado: resultado.structuredContent === undefined ? null : JSON.stringify(resultado.structuredContent).length,
    esError: resultado.isError === true,
  };
}

export interface Conexion {
  cliente: Client;
  /** Invoca una tool y devuelve sus tamaños (y el texto, que no se reporta). */
  llamar: Llamador;
  /** Invoca una tool y devuelve el resultado crudo de tools/call. */
  llamarCrudo: (tool: string, argumentos: Record<string, unknown>) => Promise<unknown>;
  cerrar: () => Promise<void>;
}

export async function conectar(nombre: string, transporte: Transport): Promise<Conexion> {
  const cliente = new Client({ name: `medicion-${nombre}`, version: '1.0.0' });
  await cliente.connect(transporte);
  await cliente.listTools(); // carga los outputSchema para que el cliente valide como lo haría un agente
  const llamarCrudo = (tool: string, argumentos: Record<string, unknown>) => cliente.callTool({ name: tool, arguments: argumentos });
  const llamar: Llamador = async (tool, argumentos) => {
    try {
      return medirResultado(await llamarCrudo(tool, argumentos));
    } catch {
      return { texto: '', caracteresTexto: 0, caracteresEstructurado: null, esError: true };
    }
  };
  return { cliente, llamar, llamarCrudo, cerrar: () => cliente.close() };
}

export function transporteV1(): Transport {
  return new StreamableHTTPClientTransport(new URL(requerido('MEDICION_URL_V1')), {
    requestInit: { headers: { Authorization: `Bearer ${requerido('MEDICION_TOKEN_V1')}` } },
  });
}

export function transporteV2(): Transport {
  return new StdioClientTransport({
    command: process.execPath,
    args: [join(RAIZ, 'dist', 'index.js')],
    env: { ...(process.env as Record<string, string>), LOG_LEVEL: 'warn' },
    stderr: 'ignore',
  });
}

export const conectarV1 = () => conectar('v1', transporteV1());
export const conectarV2 = () => conectar('v2', transporteV2());

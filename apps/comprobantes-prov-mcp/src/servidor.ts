import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Logger } from 'pino';
import { crearServidorMcp, type CualquierTool, type Sesion } from '@mcp-jkmate/core';
import { CODIGOS_ERROR } from './errores.js';

export const NOMBRE_SERVIDOR = 'mcp-comprobantes-prov';
export const VERSION_SERVIDOR = '0.1.0';

export function crearServidor(tools: CualquierTool[], deps: { logger: Logger; sesion: Sesion }): Server {
  return crearServidorMcp(tools, { nombre: NOMBRE_SERVIDOR, version: VERSION_SERVIDOR, codigosError: CODIGOS_ERROR, ...deps });
}

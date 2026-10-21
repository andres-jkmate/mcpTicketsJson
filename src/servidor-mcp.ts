import type { Logger } from 'pino';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { Sesion } from './auth/sesion.js';
import { conError, type DefinicionTool } from './tools/definicion.js';
import { ejecutarTool } from './tools/ejecutar.js';

export const NOMBRE_SERVIDOR = 'mcp-tickets-json';
export const VERSION_SERVIDOR = '0.1.0';

export interface DependenciasServidorMcp {
  logger: Logger;
  /** Usuario del proceso (stdio): todas las invocaciones corren con esta identidad. */
  sesion: Sesion;
}

// Cada tool tiene sus propios tipos de entrada y salida; el registro los trata de forma uniforme.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CualquierTool = DefinicionTool<any, any>;

/**
 * Server de bajo nivel del SDK: publica los JSON Schema tal cual (con la forma de error agregada)
 * y valida el input en el wrapper común, para responder PARAMETRO_INVALIDO con forma uniforme.
 */
export function crearServidorMcp(tools: CualquierTool[], deps: DependenciasServidorMcp): Server {
  const porNombre = new Map(tools.map((t) => [t.nombre, t]));

  const servidor = new Server(
    { name: NOMBRE_SERVIDOR, version: VERSION_SERVIDOR },
    { capabilities: { tools: {} } },
  );

  const listado: Tool[] = tools.map((t) => ({
    name: t.nombre,
    title: t.titulo,
    description: t.descripcion,
    inputSchema: t.inputSchema as Tool['inputSchema'],
    outputSchema: conError(t.outputSchema) as Tool['outputSchema'],
    annotations: t.annotations,
  }));

  servidor.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listado }));

  servidor.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = porNombre.get(request.params.name);
    if (!tool) {
      throw new McpError(ErrorCode.InvalidParams, `Tool desconocida: ${request.params.name}`);
    }
    return ejecutarTool(tool, request.params.arguments, deps.sesion, deps.logger);
  });

  return servidor;
}

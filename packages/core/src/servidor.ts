import type { Logger } from 'pino';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { CodigosError } from './errores.js';
import type { Sesion } from './sesion.js';
import { conError, type DefinicionTool } from './definicion.js';
import { ejecutarTool } from './ejecutar.js';

export interface DependenciasServidorMcp<S extends Sesion, L extends readonly string[]> {
  /** Nombre y versión que el servidor informa en el handshake MCP. */
  nombre: string;
  version: string;
  /**
   * Códigos de error del servidor, en el orden en que se publican en el enum de cada outputSchema.
   * Tiene que incluir los códigos base (`CODIGOS_BASE`); si falta alguno no compila.
   */
  codigosError: L & CodigosError<L>;
  logger: Logger;
  /** Usuario del proceso (stdio): todas las invocaciones corren con esta identidad. */
  sesion: S;
}

// Cada tool tiene sus propios tipos de entrada y salida; el registro los trata de forma uniforme.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CualquierTool<S extends Sesion = Sesion> = DefinicionTool<any, any, S>;

/**
 * Server de bajo nivel del SDK: publica los JSON Schema tal cual (con la forma de error agregada)
 * y valida el input en el wrapper común, para responder PARAMETRO_INVALIDO con forma uniforme.
 */
export function crearServidorMcp<S extends Sesion, const L extends readonly string[]>(
  tools: CualquierTool<S>[],
  deps: DependenciasServidorMcp<S, L>,
): Server {
  const porNombre = new Map(tools.map((t) => [t.nombre, t]));
  const codigosError: readonly L[number][] = deps.codigosError;

  const servidor = new Server({ name: deps.nombre, version: deps.version }, { capabilities: { tools: {} } });

  const listado: Tool[] = tools.map((t) => ({
    name: t.nombre,
    title: t.titulo,
    description: t.descripcion,
    inputSchema: t.inputSchema as Tool['inputSchema'],
    outputSchema: conError(t.outputSchema, codigosError) as Tool['outputSchema'],
    annotations: t.annotations,
  }));

  servidor.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listado }));

  servidor.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = porNombre.get(request.params.name);
    if (!tool) {
      throw new McpError(ErrorCode.InvalidParams, `Tool desconocida: ${request.params.name}`);
    }
    return ejecutarTool(tool, request.params.arguments, { sesion: deps.sesion, logger: deps.logger, codigosError });
  });

  return servidor;
}

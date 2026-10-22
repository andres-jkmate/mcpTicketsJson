/**
 * Tools que recibe el modelo (design D4): solo name, description e input_schema (el outputSchema
 * no llega al modelo), ordenadas por nombre para que el prefijo cacheado sea estable. A la v2 se le
 * agregan las tools de escritura de medicion/agente/escritura-v2.json.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { ToolEscrituraV2 } from './validacion.js';

/** Lo que devuelve listTools() de MCP (solo los campos que se usan). */
export interface ToolMcp {
  name: string;
  description?: string;
  inputSchema: { type: 'object'; [clave: string]: unknown };
}

export function aToolsModelo(publicadas: ToolMcp[], agregadas: ToolEscrituraV2[] = []): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = [
    ...publicadas.map((t) => ({ name: t.name, description: t.description ?? '', input_schema: t.inputSchema as Anthropic.Tool.InputSchema })),
    ...agregadas.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema as Anthropic.Tool.InputSchema })),
  ];
  const nombres = tools.map((t) => t.name);
  const repetida = nombres.find((n, i) => nombres.indexOf(n) !== i);
  if (repetida) throw new Error(`La tool ${repetida} figura dos veces (publicada y agregada por el arnés)`);
  return tools.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export interface TamanoTools {
  cantidad: number;
  caracteres: number;
  /** Tokens de la lista de tools según count_tokens (con tools − sin tools); null si no se midió. */
  tokens: number | null;
}

/** Caracteres de la lista tal como se serializa al request. */
export function caracteresTools(tools: Anthropic.Tool[]): number {
  return JSON.stringify(tools).length;
}

export async function medirTools(
  cliente: Pick<Anthropic, 'messages'>,
  modelo: string,
  tools: Anthropic.Tool[],
): Promise<TamanoTools> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: 'x' }];
  const [con, sin] = await Promise.all([
    cliente.messages.countTokens({ model: modelo, messages, tools }),
    cliente.messages.countTokens({ model: modelo, messages }),
  ]);
  return { cantidad: tools.length, caracteres: caracteresTools(tools), tokens: con.input_tokens - sin.input_tokens };
}

/**
 * Loop de agente manual con el SDK de Anthropic (design D1, D2, D3 y D5).
 *
 * - messages.stream(...) + finalMessage() en cada turno; mientras stop_reason === 'tool_use' se
 *   ejecutan las tools y se vuelve a llamar.
 * - El historial solo se agrega: se devuelve response.content tal cual (Opus 5.5 vincula el thinking).
 * - Las tools pedidas en un mismo turno se ejecutan en paralelo y se devuelven en un único mensaje.
 * - El resultado de una tool son los bloques de texto de content; isError → is_error.
 * - Sin fallbacks: un rechazo del modelo marca la corrida como fallida.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { EjecucionTool, RegistroEscritura } from './interceptor.js';

export const MODELO = 'claude-opus-5-5';
export const EFFORT = 'medium' as const;
export const MAX_TOKENS = 16000;

/** Prompt de sistema neutro y fijo (D3). La fecha va al final y en formato de día. */
export function promptSistema(fecha: string): string {
  return [
    'Sos un asistente de soporte de JKMate que ayuda a una persona del equipo con sus tickets y tareas de desarrollo.',
    'Respondé siempre en español, de forma clara y concisa.',
    'Cuando el pedido implica crear o modificar algo, hacelo directamente: el usuario ya dio su confirmación en el pedido, así que no la vuelvas a pedir.',
    `Fecha de hoy: ${fecha}.`,
  ].join('\n');
}

export interface UsoTurno {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface RegistroLlamadaTool {
  nombre: string;
  duracionMs: number;
  interceptada: boolean;
  error: boolean;
  errorParametro: boolean;
}

export interface RegistroTurno {
  turno: number;
  usage: UsoTurno;
  duracionMs: number;
  stopReason: string | null;
  toolsPedidas: string[];
  tools: RegistroLlamadaTool[];
  /** Tiempo de pared del lote de tools del turno (en paralelo). */
  duracionToolsMs: number;
}

export type FinCorrida = 'end_turn' | 'refusal' | 'max_turnos' | 'max_tokens' | 'tope_costo' | 'error' | 'sin_respuesta';

export interface ResultadoCorrida {
  turnos: RegistroTurno[];
  fin: FinCorrida;
  motivo?: string;
  respuestaFinal: string | null;
  tiempoTotalMs: number;
  tiempoModeloMs: number;
  tiempoToolsMs: number;
  erroresTool: number;
  erroresParametro: number;
  escrituras: RegistroEscritura[];
}

/** Cliente mínimo que usa el loop (permite simularlo en los tests). */
export interface ClienteModelo {
  messages: { stream(params: Anthropic.MessageStreamParams): { finalMessage(): Promise<Anthropic.Message> } };
}

export interface OpcionesLoop {
  cliente: ClienteModelo;
  system: string;
  tools: Anthropic.Tool[];
  pedido: string;
  maxTurnos: number;
  ejecutarTool: (nombre: string, argumentos: Record<string, unknown>) => Promise<EjecucionTool>;
  /** Se consulta antes de cada request: false corta la corrida por tope de costo. */
  puedeSeguir?: () => boolean;
  /** Se llama después de cada request con su uso (para acumular el costo). */
  alTerminarTurno?: (usage: UsoTurno) => void;
  reloj?: () => number;
}

export function parametrosRequest(o: Pick<OpcionesLoop, 'system' | 'tools'>, messages: Anthropic.MessageParam[]): Anthropic.MessageStreamParams {
  return {
    model: MODELO,
    max_tokens: MAX_TOKENS,
    output_config: { effort: EFFORT },
    cache_control: { type: 'ephemeral' },
    tool_choice: { type: 'auto' },
    system: o.system,
    tools: o.tools,
    messages,
  };
}

const textoDe = (bloques: { type: string; text?: string }[]) =>
  bloques
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('\n');

function uso(u: Anthropic.Usage): UsoTurno {
  return {
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
  };
}

export async function correrAgente(o: OpcionesLoop): Promise<ResultadoCorrida> {
  const reloj = o.reloj ?? (() => performance.now());
  const inicio = reloj();
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: o.pedido }];
  const turnos: RegistroTurno[] = [];
  const escrituras: RegistroEscritura[] = [];
  let tiempoModeloMs = 0;
  let tiempoToolsMs = 0;

  const terminar = (fin: FinCorrida, respuestaFinal: string | null, motivo?: string): ResultadoCorrida => {
    const llamadas = turnos.flatMap((t) => t.tools);
    return {
      turnos,
      fin,
      ...(motivo ? { motivo } : {}),
      respuestaFinal,
      tiempoTotalMs: reloj() - inicio,
      tiempoModeloMs,
      tiempoToolsMs,
      erroresTool: llamadas.filter((l) => l.error).length,
      erroresParametro: llamadas.filter((l) => l.errorParametro).length,
      escrituras,
    };
  };

  for (let turno = 1; ; turno++) {
    if (turno > o.maxTurnos) return terminar('max_turnos', null, `Se alcanzó el límite de ${o.maxTurnos} turnos`);
    if (o.puedeSeguir && !o.puedeSeguir()) return terminar('tope_costo', null, 'Se alcanzó el tope de costo');

    const t0 = reloj();
    let respuesta: Anthropic.Message;
    try {
      respuesta = await o.cliente.messages.stream(parametrosRequest(o, messages)).finalMessage();
    } catch (error) {
      tiempoModeloMs += reloj() - t0;
      return terminar('error', null, error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    }
    const duracionMs = reloj() - t0;
    tiempoModeloMs += duracionMs;
    o.alTerminarTurno?.(uso(respuesta.usage));

    const pedidas = respuesta.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const registro: RegistroTurno = {
      turno,
      usage: uso(respuesta.usage),
      duracionMs,
      stopReason: respuesta.stop_reason,
      toolsPedidas: pedidas.map((p) => p.name),
      tools: [],
      duracionToolsMs: 0,
    };
    turnos.push(registro);
    messages.push({ role: 'assistant', content: respuesta.content });

    if (respuesta.stop_reason === 'refusal') {
      const d = respuesta.stop_details;
      return terminar('refusal', null, `Rechazo del modelo${d?.category ? ` (${d.category})` : ''}${d?.explanation ? `: ${d.explanation}` : ''}`);
    }
    if (respuesta.stop_reason === 'max_tokens') return terminar('max_tokens', null, `La respuesta superó max_tokens (${MAX_TOKENS})`);
    if (respuesta.stop_reason !== 'tool_use') {
      const texto = textoDe(respuesta.content);
      return texto.trim() ? terminar('end_turn', texto) : terminar('sin_respuesta', null, `El agente terminó (${respuesta.stop_reason}) sin respuesta final`);
    }

    const tLote = reloj();
    const resultados = await Promise.all(
      pedidas.map(async (p): Promise<Anthropic.ToolResultBlockParam> => {
        const tTool = reloj();
        let ejecucion: EjecucionTool;
        try {
          ejecucion = await o.ejecutarTool(p.name, (p.input ?? {}) as Record<string, unknown>);
        } catch (error) {
          // Un error de protocolo o de red no corta la corrida: el modelo lo recibe como error de tool.
          ejecucion = {
            resultado: { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] },
            interceptada: false,
            errorParametro: false,
          };
        }
        registro.tools.push({
          nombre: p.name,
          duracionMs: reloj() - tTool,
          interceptada: ejecucion.interceptada,
          error: ejecucion.resultado.isError === true,
          errorParametro: ejecucion.errorParametro,
        });
        if (ejecucion.escritura) escrituras.push(ejecucion.escritura);
        return {
          type: 'tool_result',
          tool_use_id: p.id,
          content: textoDe(ejecucion.resultado.content),
          ...(ejecucion.resultado.isError ? { is_error: true } : {}),
        };
      }),
    );
    registro.duracionToolsMs = reloj() - tLote;
    tiempoToolsMs += registro.duracionToolsMs;
    messages.push({ role: 'user', content: resultados });
  }
}

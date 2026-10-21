/**
 * Estimador sin API (design D12): ejecuta el guion de un caso (lecturas reenviadas a los servidores,
 * escrituras por el interceptor) y mide caracteres por turno. Después convierte esas medidas a tokens
 * con una razón de caracteres por token, en dos escenarios de caché. No llama al modelo.
 *
 * Por turno: entrada = prompt de tool use + tools + sistema + historial. La salida son los argumentos
 * de las llamadas más los supuestos de thinking y, en el último turno, de la respuesta final. Al
 * historial vuelven los argumentos (no el thinking) y los resultados de las tools.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { caracteresTools } from './herramientas.js';
import type { EjecucionTool } from './interceptor.js';
import type { UsoTurno } from './loop.js';
import { rellenarArgumentos, type Guion, type SupuestosEstimacion } from './guiones.js';

export interface LlamadaMedida {
  tool: string;
  interceptada: boolean;
  error: boolean;
  /** Nombre de la tool + argumentos serializados, tal como los generaría el modelo. */
  caracteresArgumentos: number;
  /** Bloques de texto de content, que es lo que vuelve al modelo (D5). */
  caracteresResultado: number;
}

/** Medidas en caracteres de una conversación simulada. No guarda textos. */
export interface ConversacionMedida {
  cantidadTools: number;
  caracteresTools: number;
  caracteresSistema: number;
  caracteresPedido: number;
  /** Un elemento por request al modelo; el último es el de la respuesta final (sin llamadas). */
  turnos: { llamadas: LlamadaMedida[] }[];
}

export interface OpcionesSimulacion {
  guion: Guion;
  tools: Anthropic.Tool[];
  system: string;
  pedido: string;
  hoy: string;
  ejecutarTool: (tool: string, argumentos: Record<string, unknown>) => Promise<EjecucionTool>;
}

const textoDe = (bloques: { type: string; text?: string }[]) =>
  bloques
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('\n');

export async function simularGuion(o: OpcionesSimulacion): Promise<ConversacionMedida> {
  const nombres = new Set(o.tools.map((t) => t.name));
  const turnos: ConversacionMedida['turnos'] = [];
  for (const [i, turno] of o.guion.entries()) {
    const llamadas = await Promise.all(
      turno.map(async (l): Promise<LlamadaMedida> => {
        if (!nombres.has(l.tool)) throw new Error(`Guion inválido (turno ${i + 1}): el modelo no recibe la tool ${l.tool}`);
        const argumentos = rellenarArgumentos(l.argumentos, o.hoy) as Record<string, unknown>;
        const ejecucion = await o.ejecutarTool(l.tool, argumentos);
        if (ejecucion.interceptada && (ejecucion.errorParametro || ejecucion.resultado.isError)) {
          const motivos = ejecucion.escritura?.errores.map((e) => `${e.campo}: ${e.mensaje}`).join('; ') ?? textoDe(ejecucion.resultado.content);
          throw new Error(`Guion inválido (turno ${i + 1}): la escritura ${l.tool} no valida (${motivos})`);
        }
        return {
          tool: l.tool,
          interceptada: ejecucion.interceptada,
          error: ejecucion.resultado.isError === true,
          caracteresArgumentos: l.tool.length + JSON.stringify(argumentos).length,
          caracteresResultado: textoDe(ejecucion.resultado.content).length,
        };
      }),
    );
    turnos.push({ llamadas });
  }
  turnos.push({ llamadas: [] });
  return {
    cantidadTools: o.tools.length,
    caracteresTools: caracteresTools(o.tools),
    caracteresSistema: o.system.length,
    caracteresPedido: o.pedido.length,
    turnos,
  };
}

// ---------------------------------------------------------------- tokens

export type Escenario = 'sesionCaliente' | 'sinCache';
export const ESCENARIOS: readonly Escenario[] = ['sesionCaliente', 'sinCache'];

/** Mismos campos que informa la API (sin redondear: se redondea al mostrar). */
export type TokensTurno = UsoTurno;

/** Tokens del prefijo fijo de cada request: prompt de tool use + tools + sistema. */
export function tokensPrefijo(m: ConversacionMedida, s: SupuestosEstimacion, razon: number): number {
  return s.promptToolUse + (m.caracteresTools + m.caracteresSistema) / razon;
}

/**
 * Tokens por turno en los dos escenarios:
 * - sesionCaliente: el prefijo ya está en caché. En el turno 1 se lee el prefijo y el pedido es la
 *   única entrada sin caché; desde el turno 2 se lee el request anterior completo y se escribe lo nuevo.
 * - sinCache: toda la entrada se paga como entrada normal (cota superior).
 */
export function tokensConversacion(m: ConversacionMedida, s: SupuestosEstimacion, razon: number): Record<Escenario, TokensTurno[]> {
  const prefijo = tokensPrefijo(m, s, razon);
  const pedido = m.caracteresPedido / razon;
  const caliente: TokensTurno[] = [];
  const sinCache: TokensTurno[] = [];
  let historial = pedido;
  let entradaAnterior = 0;
  for (const [i, turno] of m.turnos.entries()) {
    const entrada = prefijo + historial;
    const argumentos = turno.llamadas.reduce((a, l) => a + l.caracteresArgumentos, 0) / razon;
    const resultados = turno.llamadas.reduce((a, l) => a + l.caracteresResultado, 0) / razon;
    const ultimo = i === m.turnos.length - 1;
    const output_tokens = argumentos + s.thinkingPorTurno + (ultimo ? s.respuestaFinal : 0);
    caliente.push(
      i === 0
        ? { input_tokens: pedido, cache_read_input_tokens: prefijo, cache_creation_input_tokens: 0, output_tokens }
        : { input_tokens: 0, cache_read_input_tokens: entradaAnterior, cache_creation_input_tokens: entrada - entradaAnterior, output_tokens },
    );
    sinCache.push({ input_tokens: entrada, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens });
    entradaAnterior = entrada;
    historial += argumentos + resultados;
  }
  return { sesionCaliente: caliente, sinCache };
}

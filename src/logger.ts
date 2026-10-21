import pino, { type DestinationStream, type Logger } from 'pino';
import { createStream as crearStreamSeq } from 'pino-seq';
import type { Config } from './config.js';

/** Rutas que nunca deben llegar al log (credenciales en cualquier forma en que se logueen). */
export const RUTAS_REDACTADAS = [
  'authorization',
  '*.authorization',
  'headers.authorization',
  'req.headers.authorization',
  'request.headers.authorization',
  'token',
  '*.token',
];

type ConfigLogger = Pick<Config, 'LOG_LEVEL' | 'SEQ_URL' | 'SEQ_API_KEY'>;

/**
 * Crea el logger de la aplicación: Pino a stderr y, si hay SEQ_URL, también a Seq. Nunca a stdout:
 * con transporte stdio, stdout es el canal del protocolo MCP.
 * `destino` reemplaza a stderr (lo usan los tests para capturar la salida).
 */
export function crearLogger(config: ConfigLogger, destino?: DestinationStream): Logger {
  const streams: pino.StreamEntry[] = [{ stream: destino ?? process.stderr }];
  if (config.SEQ_URL) {
    streams.push({
      stream: crearStreamSeq({
        serverUrl: config.SEQ_URL,
        ...(config.SEQ_API_KEY ? { apiKey: config.SEQ_API_KEY } : {}),
        additionalProperties: { Aplicacion: 'mcp-tickets-json' },
      }),
    });
  }

  return pino(
    {
      level: config.LOG_LEVEL,
      base: { app: 'mcp-tickets-json' },
      redact: { paths: RUTAS_REDACTADAS, censor: '[REDACTADO]' },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.multistream(streams),
  );
}

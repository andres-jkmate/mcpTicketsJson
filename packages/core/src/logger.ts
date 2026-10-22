import pino, { type DestinationStream, type Logger } from 'pino';
import { createStream as crearStreamSeq } from 'pino-seq';

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

export interface ConfigLogger {
  /** Nombre de la app: va en el campo `app` de cada evento y como `Aplicacion` en Seq. */
  app: string;
  LOG_LEVEL: pino.LevelWithSilent;
  SEQ_URL?: string | undefined;
  SEQ_API_KEY?: string | undefined;
}

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
        additionalProperties: { Aplicacion: config.app },
      }),
    });
  }

  return pino(
    {
      level: config.LOG_LEVEL,
      base: { app: config.app },
      redact: { paths: RUTAS_REDACTADAS, censor: '[REDACTADO]' },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.multistream(streams),
  );
}

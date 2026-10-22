/*
 * Apoyo para los tests de los MCPs: logger en memoria y un cliente real del SDK conectado al
 * servidor sin proceso ni red. No se usa en producción.
 */
import { Writable } from 'node:stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { verificarDescripcion } from './descripcion.js';
import type { CodigosError } from './errores.js';
import { crearLogger } from './logger.js';
import { crearServidorMcp, type CualquierTool } from './servidor.js';
import type { Sesion } from './sesion.js';

/** Logger que acumula los eventos en memoria, ya parseados. */
export function loggerEnMemoria(app = 'test') {
  const eventos: Record<string, unknown>[] = [];
  const crudo: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      const linea = chunk.toString();
      crudo.push(linea);
      eventos.push(JSON.parse(linea) as Record<string, unknown>);
      cb();
    },
  });
  const logger = crearLogger({ app, LOG_LEVEL: 'debug' }, stream);
  return { logger, eventos, crudo };
}

export interface OpcionesCliente<S extends Sesion, L extends readonly string[]> {
  sesion: S;
  codigosError: L & CodigosError<L>;
  nombre?: string;
  version?: string;
}

/** Conecta un cliente real del SDK a un servidor con las tools dadas, sin proceso ni red. */
export async function conectarCliente<S extends Sesion, const L extends readonly string[]>(
  tools: CualquierTool<S>[],
  opciones: OpcionesCliente<S, L>,
) {
  const { logger, eventos, crudo } = loggerEnMemoria(opciones.nombre);
  const servidor = crearServidorMcp(tools, {
    nombre: opciones.nombre ?? 'test',
    version: opciones.version ?? '0.0.0',
    codigosError: opciones.codigosError,
    logger,
    sesion: opciones.sesion,
  });
  const cliente = new Client({ name: 'test', version: '0.0.0' });
  const [lado1, lado2] = InMemoryTransport.createLinkedPair();
  await Promise.all([servidor.connect(lado1), cliente.connect(lado2)]);
  return { cliente, servidor, eventos, crudo };
}

/**
 * Recorre las tools publicadas en `tools/list` y devuelve, por tool, lo que le falta a su
 * descripción según la plantilla (ver `verificarDescripcion`). Vacío = todas cumplen.
 */
export function problemasDeDescripcion(tools: Pick<Tool, 'name' | 'description'>[]): { tool: string; problemas: string[] }[] {
  return tools
    .map((t) => ({ tool: t.name, problemas: verificarDescripcion(t.description ?? '') }))
    .filter((t) => t.problemas.length > 0);
}

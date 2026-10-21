import type { AccesoDatos, Fila, ValorParametro } from '../src/db/firebird.js';
import { relojDesdeTexto } from '../src/mapeo/fecha.js';
import { Writable } from 'node:stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Sesion } from '../src/auth/sesion.js';
import { crearLogger } from '../src/logger.js';
import { crearServidorMcp } from '../src/servidor-mcp.js';
import type { DefinicionTool } from '../src/tools/definicion.js';

export const SESION_PRUEBA: Sesion = { codUsuario: 15169, codDesarrollador: 100936 };

/** Logger que acumula los eventos en memoria, ya parseados. */
export function loggerEnMemoria() {
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
  const logger = crearLogger({ LOG_LEVEL: 'debug', SEQ_URL: undefined, SEQ_API_KEY: undefined }, stream);
  return { logger, eventos, crudo };
}

/** Conecta un cliente real del SDK a un servidor con las tools dadas, sin HTTP. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function conectarCliente(tools: DefinicionTool<any, any>[], sesion: Sesion = SESION_PRUEBA) {
  const { logger, eventos, crudo } = loggerEnMemoria();
  const servidor = crearServidorMcp(tools, { logger, sesion });
  const cliente = new Client({ name: 'test', version: '0.0.0' });
  const [lado1, lado2] = InMemoryTransport.createLinkedPair();
  await Promise.all([servidor.connect(lado1), cliente.connect(lado2)]);
  return { cliente, servidor, eventos, crudo };
}

// ---------------------------------------------------------------- base simulada


/** Reloj de la base desde 'AAAA-MM-DD HH:mm:ss.SSS'. */
export const r = relojDesdeTexto;

export type ManejadorSp = (parametros: ValorParametro[]) => Fila[];

/**
 * AccesoDatos en memoria: cada SP responde con su manejador (filas sin RESULTADO; se agrega
 * RESULTADO = 1). Registra las llamadas para verificar parámetros.
 */
export function accesoSimulado(manejadores: Record<string, ManejadorSp>, codDesarrollador: number | null = 100936) {
  const llamadas: { nombre: string; parametros: ValorParametro[] }[] = [];
  const acceso: AccesoDatos = {
    async enTransaccion(trabajo, medidor) {
      return trabajo(async (nombre, parametros) => {
        if (medidor) medidor.llamadasBase += 1;
        llamadas.push({ nombre, parametros });
        const manejador = manejadores[nombre];
        if (!manejador) throw new Error(`SP no simulado: ${nombre}`);
        return manejador(parametros).map((f) => ('RESULTADO' in f ? f : { RESULTADO: 1, MENSAJE_ERROR: '', ...f }));
      });
    },
    async codDesarrolladorDeUsuario() {
      return codDesarrollador;
    },
    async cerrar() {},
  };
  return { acceso, llamadas };
}

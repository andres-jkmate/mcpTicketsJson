import type { CualquierTool } from '@mcp-jkmate/core';
import { conectarCliente as conectarClienteCore } from '@mcp-jkmate/core/pruebas';
import { type AccesoDatos, type Fila, relojDesdeTexto, type ValorParametro } from '@mcp-jkmate/firebird';
import { CODIGOS_ERROR } from '../src/errores.js';
import { NOMBRE_SERVIDOR, VERSION_SERVIDOR } from '../src/servidor.js';
import type { SesionTickets } from '../src/sesion.js';

export const SESION_PRUEBA: SesionTickets = { codUsuario: 15169, codDesarrollador: 100936 };

/** Conecta un cliente real del SDK a un servidor de tickets con las tools dadas, sin HTTP. */
export async function conectarCliente(tools: CualquierTool<SesionTickets>[], sesion: SesionTickets = SESION_PRUEBA) {
  return conectarClienteCore(tools, { sesion, codigosError: CODIGOS_ERROR, nombre: NOMBRE_SERVIDOR, version: VERSION_SERVIDOR });
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
    async consultar<T>(): Promise<T[]> {
      // La única consulta fija de tickets es la del desarrollador del usuario (db/usuarios.ts).
      return [{ COD_DESARROLLADOR: codDesarrollador }] as T[];
    },
    async cerrar() {},
  };
  return { acceso, llamadas };
}

import type { CualquierTool, Sesion } from '@mcp-jkmate/core';
import { conectarCliente as conectarClienteCore } from '@mcp-jkmate/core/pruebas';
import type { AccesoDatos, Fila, ValorParametro } from '@mcp-jkmate/firebird';
import { CODIGOS_ERROR } from '../src/errores.js';
import { NOMBRE_SERVIDOR, VERSION_SERVIDOR } from '../src/servidor.js';

export const SESION_PRUEBA: Sesion = { codUsuario: 15169 };

/** Conecta un cliente real del SDK al servidor con las tools dadas, sin proceso ni base. */
export async function conectarCliente(tools: CualquierTool[], sesion: Sesion = SESION_PRUEBA) {
  return conectarClienteCore(tools, { sesion, codigosError: CODIGOS_ERROR, nombre: NOMBRE_SERVIDOR, version: VERSION_SERVIDOR });
}

export type ManejadorSp = (parametros: ValorParametro[]) => Fila[];

/**
 * AccesoDatos en memoria: cada SP responde con su manejador (filas sin RESULTADO; se agrega
 * RESULTADO = 1). Registra las llamadas para verificar parámetros.
 */
export function accesoSimulado(manejadores: Record<string, ManejadorSp>) {
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
    async consultar() {
      throw new Error('consultar no está simulado');
    },
    async cerrar() {},
  };
  return { acceso, llamadas };
}

import { describe, expect, it } from 'vitest';
import { relojDesdeTexto } from '@mcp-jkmate/firebird';
import { crearObtenerEjemplo } from '../src/tools/obtener-ejemplo.js';
import { accesoSimulado, conectarCliente, type ManejadorSp } from './apoyo.js';

const EJEMPLO_7: ManejadorSp = ([id]) =>
  id === 7 ? [{ COD_EJEMPLO: 7, NOMBRE: ' Ejemplo siete ', ACTIVO: 1, FECHA_ALTA: relojDesdeTexto('2026-10-01 09:30:00') }] : [];

async function llamar(argumentos: Record<string, unknown>) {
  const { acceso, llamadas } = accesoSimulado({ PROC_GET_EJEMPLO_AG: EJEMPLO_7 });
  const { cliente, eventos } = await conectarCliente([crearObtenerEjemplo({ acceso })]);
  await cliente.listTools(); // el cliente valida structuredContent contra el outputSchema
  const resultado = await cliente.callTool({ name: 'obtener_ejemplo', arguments: argumentos });
  return { resultado, llamadas, eventos };
}

describe('obtener_ejemplo', () => {
  it('convierte la fila del SP al contrato: textos recortados, booleano real y fecha ISO', async () => {
    const { resultado, llamadas } = await llamar({ ejemploId: 7 });
    expect(resultado.isError).toBeFalsy();
    expect(resultado.structuredContent).toEqual({ ejemplo: { id: 7, nombre: 'Ejemplo siete', activo: true, fechaAlta: '2026-10-01' } });
    expect(llamadas).toEqual([{ nombre: 'PROC_GET_EJEMPLO_AG', parametros: [7], escritura: false }]);
  });

  it('un ejemplo inexistente responde EJEMPLO_NO_ENCONTRADO', async () => {
    const { resultado } = await llamar({ ejemploId: 8 });
    expect(resultado.isError).toBe(true);
    expect(resultado.structuredContent).toMatchObject({ error: { codigo: 'EJEMPLO_NO_ENCONTRADO' } });
  });

  it('un RESULTADO = 0 del SP responde PARAMETRO_INVALIDO con su mensaje', async () => {
    const { acceso } = accesoSimulado({ PROC_GET_EJEMPLO_AG: () => [{ RESULTADO: 0, MENSAJE_ERROR: 'Ejemplo dado de baja' }] });
    const { cliente } = await conectarCliente([crearObtenerEjemplo({ acceso })]);
    const resultado = await cliente.callTool({ name: 'obtener_ejemplo', arguments: { ejemploId: 1 } });
    expect(resultado.structuredContent).toEqual({ error: { codigo: 'PARAMETRO_INVALIDO', mensaje: 'Ejemplo dado de baja' } });
  });

  it('cuenta la llamada a la base en el evento de invocación', async () => {
    const { eventos } = await llamar({ ejemploId: 7 });
    expect(eventos.find((e) => e.evento === 'invocacion_tool')).toMatchObject({ tool: 'obtener_ejemplo', llamadasBase: 1 });
  });
});

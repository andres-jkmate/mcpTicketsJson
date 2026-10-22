import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { conectarCliente } from '../../test/apoyo.js';
import { ErrorTool } from '../errores.js';
import type { DefinicionTool } from './definicion.js';

const entrada = z.object({ ticketId: z.number().int().min(1), limite: z.number().int().min(1).max(100).default(20) }).strict();

const toolPrueba: DefinicionTool<z.infer<typeof entrada>, { ticket: { id: number }; total: number }> = {
  nombre: 'obtener_prueba',
  titulo: 'Prueba',
  descripcion: 'Tool de prueba',
  inputSchema: {
    type: 'object',
    properties: {
      ticketId: { type: 'integer', minimum: 1 },
      limite: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
    required: ['ticketId'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      ticket: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
      total: { type: 'integer' },
    },
    required: ['ticket', 'total'],
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  entrada,
  async ejecutar(args, ctx) {
    ctx.medidor.llamadasBase += 2;
    if (args.ticketId === 404) throw new ErrorTool('TICKET_NO_ENCONTRADO', 'El ticket 404 no existe');
    if (args.ticketId === 500) throw new Error('fallo de conexión con password=masterkey');
    return { datos: { ticket: { id: args.ticketId }, total: args.limite }, resumen: `Ticket #${args.ticketId}` };
  },
};

describe('wrapper común de tools (cliente real del SDK)', () => {
  it('el cliente del SDK acepta un resultado isError en una tool con outputSchema', async () => {
    const { cliente } = await conectarCliente([toolPrueba]);
    await cliente.listTools(); // carga los validadores de outputSchema en el cliente
    const resultado = await cliente.callTool({ name: 'obtener_prueba', arguments: { ticketId: 404 } });
    expect(resultado.isError).toBe(true);
    expect(resultado.structuredContent).toEqual({
      error: { codigo: 'TICKET_NO_ENCONTRADO', mensaje: 'El ticket 404 no existe' },
    });
  });

  it('el éxito valida contra el outputSchema publicado y aplica defaults del input', async () => {
    const { cliente } = await conectarCliente([toolPrueba]);
    await cliente.listTools();
    const resultado = await cliente.callTool({ name: 'obtener_prueba', arguments: { ticketId: 7 } });
    expect(resultado.isError).toBeFalsy();
    expect(resultado.structuredContent).toEqual({ ticket: { id: 7 }, total: 20 });
    expect(resultado.content).toEqual([
      { type: 'text', text: 'Ticket #7' },
      { type: 'text', text: JSON.stringify({ ticket: { id: 7 }, total: 20 }) },
    ]);
  });

  it('un input inválido responde PARAMETRO_INVALIDO con el detalle por campo', async () => {
    const { cliente } = await conectarCliente([toolPrueba]);
    await cliente.listTools();
    const resultado = await cliente.callTool({ name: 'obtener_prueba', arguments: { ticketId: 1, limite: 500 } });
    expect(resultado.isError).toBe(true);
    const { error } = resultado.structuredContent as { error: { codigo: string; detalle: { campo: string }[] } };
    expect(error.codigo).toBe('PARAMETRO_INVALIDO');
    expect(error.detalle.map((d) => d.campo)).toEqual(['limite']);
  });

  it('un error inesperado sale como ERROR_INTERNO y la traza queda solo en el log', async () => {
    const { cliente, eventos } = await conectarCliente([toolPrueba]);
    await cliente.listTools();
    const resultado = await cliente.callTool({ name: 'obtener_prueba', arguments: { ticketId: 500 } });
    expect(resultado.structuredContent).toMatchObject({ error: { codigo: 'ERROR_INTERNO' } });
    expect(JSON.stringify(resultado)).not.toContain('masterkey');
    const errorLog = eventos.find((e) => e.msg === 'Error inesperado en una tool') as { err: { stack: string } };
    expect(errorLog.err.stack).toContain('fallo de conexión');
  });

  it('publica outputSchema con la forma de error y las annotations', async () => {
    const { cliente } = await conectarCliente([toolPrueba]);
    const { tools } = await cliente.listTools();
    const [tool] = tools;
    expect(tool?.annotations?.readOnlyHint).toBe(true);
    expect(tool?.outputSchema).toMatchObject({
      properties: { error: { required: ['codigo', 'mensaje'] } },
      anyOf: [{ required: ['ticket', 'total'] }, { required: ['error'] }],
    });
  });

  it('emite un evento de log por invocación con las métricas', async () => {
    const { cliente, eventos } = await conectarCliente([toolPrueba]);
    await cliente.callTool({ name: 'obtener_prueba', arguments: { ticketId: 7 } });
    await cliente.callTool({ name: 'obtener_prueba', arguments: { ticketId: 404 } });
    const invocaciones = eventos.filter((e) => e.evento === 'invocacion_tool');
    expect(invocaciones).toHaveLength(2);
    expect(invocaciones[0]).toMatchObject({ tool: 'obtener_prueba', codUsuario: 15169, llamadasBase: 2 });
    expect(invocaciones[0]?.caracteresRespuesta).toBeGreaterThan(0);
    expect(typeof invocaciones[0]?.duracionMs).toBe('number');
    expect(invocaciones[0]).not.toHaveProperty('codigoError');
    expect(invocaciones[1]).toMatchObject({ codigoError: 'TICKET_NO_ENCONTRADO' });
  });
});

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { DefinicionTool } from './definicion.js';
import { ErrorTool } from './errores.js';
import { conectarCliente } from './pruebas.js';

const CODIGOS = ['PARAMETRO_INVALIDO', 'RECURSO_NO_ENCONTRADO', 'NO_AUTORIZADO', 'BASE_NO_DISPONIBLE', 'ERROR_INTERNO'] as const;
type Codigo = (typeof CODIGOS)[number];

const entrada = z.object({ recursoId: z.number().int().min(1), limite: z.number().int().min(1).max(100).default(20) }).strict();

const toolPrueba: DefinicionTool<z.infer<typeof entrada>, { recurso: { id: number }; total: number }> = {
  nombre: 'obtener_prueba',
  titulo: 'Prueba',
  descripcion: 'Tool de prueba',
  inputSchema: {
    type: 'object',
    properties: {
      recursoId: { type: 'integer', minimum: 1 },
      limite: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
    required: ['recursoId'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      recurso: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
      total: { type: 'integer' },
    },
    required: ['recurso', 'total'],
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  entrada,
  async ejecutar(args, ctx) {
    ctx.medidor.llamadasBase += 2;
    ctx.logger.info({ recursoId: args.recursoId }, 'Log interno de la tool');
    if (args.recursoId === 404) throw new ErrorTool<Codigo>('RECURSO_NO_ENCONTRADO', 'El recurso 404 no existe');
    if (args.recursoId === 409) throw new ErrorTool<'CODIGO_AJENO'>('CODIGO_AJENO', 'Un código que el servidor no declaró');
    if (args.recursoId === 500) throw new Error('fallo de conexión con password=masterkey');
    return { datos: { recurso: { id: args.recursoId }, total: args.limite }, resumen: `Recurso #${args.recursoId}` };
  },
};

const conectar = () => conectarCliente([toolPrueba], { sesion: { codUsuario: 15169 }, codigosError: CODIGOS });

describe('wrapper común de tools (cliente real del SDK)', () => {
  it('el cliente del SDK acepta un resultado isError en una tool con outputSchema', async () => {
    const { cliente } = await conectar();
    await cliente.listTools(); // carga los validadores de outputSchema en el cliente
    const resultado = await cliente.callTool({ name: 'obtener_prueba', arguments: { recursoId: 404 } });
    expect(resultado.isError).toBe(true);
    expect(resultado.structuredContent).toEqual({
      error: { codigo: 'RECURSO_NO_ENCONTRADO', mensaje: 'El recurso 404 no existe' },
    });
  });

  it('el éxito valida contra el outputSchema publicado y aplica defaults del input', async () => {
    const { cliente } = await conectar();
    await cliente.listTools();
    const resultado = await cliente.callTool({ name: 'obtener_prueba', arguments: { recursoId: 7 } });
    expect(resultado.isError).toBeFalsy();
    expect(resultado.structuredContent).toEqual({ recurso: { id: 7 }, total: 20 });
    expect(resultado.content).toEqual([
      { type: 'text', text: 'Recurso #7' },
      { type: 'text', text: JSON.stringify({ recurso: { id: 7 }, total: 20 }) },
    ]);
  });

  it('un input inválido responde PARAMETRO_INVALIDO con el detalle por campo', async () => {
    const { cliente } = await conectar();
    await cliente.listTools();
    const resultado = await cliente.callTool({ name: 'obtener_prueba', arguments: { recursoId: 1, limite: 500 } });
    expect(resultado.isError).toBe(true);
    const { error } = resultado.structuredContent as { error: { codigo: string; detalle: { campo: string }[] } };
    expect(error.codigo).toBe('PARAMETRO_INVALIDO');
    expect(error.detalle.map((d) => d.campo)).toEqual(['limite']);
  });

  it('un error inesperado sale como ERROR_INTERNO y la traza queda solo en el log', async () => {
    const { cliente, eventos } = await conectar();
    await cliente.listTools();
    const resultado = await cliente.callTool({ name: 'obtener_prueba', arguments: { recursoId: 500 } });
    expect(resultado.structuredContent).toMatchObject({ error: { codigo: 'ERROR_INTERNO' } });
    expect(JSON.stringify(resultado)).not.toContain('masterkey');
    const errorLog = eventos.find((e) => e.msg === 'Error inesperado en una tool') as { err: { stack: string } };
    expect(errorLog.err.stack).toContain('fallo de conexión');
  });

  it('un código que el servidor no declaró sale como ERROR_INTERNO y queda en el log', async () => {
    const { cliente, eventos } = await conectar();
    await cliente.listTools();
    const resultado = await cliente.callTool({ name: 'obtener_prueba', arguments: { recursoId: 409 } });
    expect(resultado.isError).toBe(true);
    expect(resultado.structuredContent).toMatchObject({ error: { codigo: 'ERROR_INTERNO' } });
    expect(JSON.stringify(resultado)).not.toContain('CODIGO_AJENO');
    expect(eventos.find((e) => e.msg === 'Código de error no declarado por el servidor')).toMatchObject({ codigo: 'CODIGO_AJENO' });
    expect(eventos.find((e) => e.evento === 'invocacion_tool')).toMatchObject({ codigoError: 'ERROR_INTERNO' });
  });

  it('publica outputSchema con la forma de error, los códigos del servidor y las annotations', async () => {
    const { cliente } = await conectar();
    const { tools } = await cliente.listTools();
    const [tool] = tools;
    expect(tool?.annotations?.readOnlyHint).toBe(true);
    expect(tool?.outputSchema).toMatchObject({
      properties: { error: { required: ['codigo', 'mensaje'], properties: { codigo: { enum: [...CODIGOS] } } } },
      anyOf: [{ required: ['recurso', 'total'] }, { required: ['error'] }],
    });
  });

  it('emite un evento de log por invocación con las métricas', async () => {
    const { cliente, eventos } = await conectar();
    await cliente.callTool({ name: 'obtener_prueba', arguments: { recursoId: 7 } });
    await cliente.callTool({ name: 'obtener_prueba', arguments: { recursoId: 404 } });
    const invocaciones = eventos.filter((e) => e.evento === 'invocacion_tool');
    expect(invocaciones).toHaveLength(2);
    expect(invocaciones[0]).toMatchObject({ tool: 'obtener_prueba', codUsuario: 15169, llamadasBase: 2 });
    expect(invocaciones[0]?.caracteresRespuesta).toBeGreaterThan(0);
    expect(typeof invocaciones[0]?.duracionMs).toBe('number');
    expect(invocaciones[0]).not.toHaveProperty('codigoError');
    expect(invocaciones[1]).toMatchObject({ codigoError: 'RECURSO_NO_ENCONTRADO' });
  });
});

describe('idCorrelacion', () => {
  it('el evento de invocación lleva idCorrelacion junto con los campos de siempre', async () => {
    const { cliente, eventos } = await conectar();
    await cliente.callTool({ name: 'obtener_prueba', arguments: { recursoId: 7 } });
    const [invocacion] = eventos.filter((e) => e.evento === 'invocacion_tool');
    expect(Object.keys(invocacion!)).toEqual(
      expect.arrayContaining(['tool', 'codUsuario', 'duracionMs', 'llamadasBase', 'caracteresRespuesta', 'idCorrelacion']),
    );
    expect(invocacion!.idCorrelacion).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('el log de un error inesperado y el evento de invocación comparten el idCorrelacion', async () => {
    const { cliente, eventos } = await conectar();
    await cliente.callTool({ name: 'obtener_prueba', arguments: { recursoId: 500 } });
    const error = eventos.find((e) => e.msg === 'Error inesperado en una tool');
    const invocacion = eventos.find((e) => e.evento === 'invocacion_tool');
    const interno = eventos.find((e) => e.msg === 'Log interno de la tool');
    expect(error?.idCorrelacion).toBeDefined();
    expect(invocacion?.idCorrelacion).toBe(error?.idCorrelacion);
    expect(interno?.idCorrelacion).toBe(error?.idCorrelacion);
  });

  it('dos invocaciones con los mismos argumentos tienen idCorrelacion distintos', async () => {
    const { cliente, eventos } = await conectar();
    await cliente.callTool({ name: 'obtener_prueba', arguments: { recursoId: 7 } });
    await cliente.callTool({ name: 'obtener_prueba', arguments: { recursoId: 7 } });
    const [a, b] = eventos.filter((e) => e.evento === 'invocacion_tool');
    expect(a?.idCorrelacion).toBeDefined();
    expect(a?.idCorrelacion).not.toBe(b?.idCorrelacion);
  });
});

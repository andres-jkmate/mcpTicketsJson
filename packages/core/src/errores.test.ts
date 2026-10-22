import { describe, expect, it } from 'vitest';
import { CODIGOS_BASE, ErrorTool, esquemaError, normalizarError, resultadoError } from './errores.js';

describe('errores', () => {
  it.each(CODIGOS_BASE)('%s se convierte en isError con structuredContent.error', (codigo) => {
    const resultado = resultadoError(new ErrorTool(codigo, 'mensaje de prueba', { campo: 'x' }));
    expect(resultado.isError).toBe(true);
    expect(resultado.structuredContent).toEqual({
      error: { codigo, mensaje: 'mensaje de prueba', detalle: { campo: 'x' } },
    });
    expect(resultado.content).toEqual([{ type: 'text', text: `${codigo}: mensaje de prueba` }]);
  });

  it('omite detalle cuando no se indica', () => {
    const resultado = resultadoError(new ErrorTool<'RECURSO_NO_ENCONTRADO'>('RECURSO_NO_ENCONTRADO', 'No existe'));
    expect(resultado.structuredContent).toEqual({ error: { codigo: 'RECURSO_NO_ENCONTRADO', mensaje: 'No existe' } });
  });

  it('un error inesperado sale como ERROR_INTERNO sin traza ni mensaje original', () => {
    const original = new Error('SQL error code = -204 Table unknown RECLAMOS password=masterkey');
    const resultado = resultadoError(normalizarError(original));
    const serializado = JSON.stringify(resultado);
    expect(resultado.structuredContent).toMatchObject({ error: { codigo: 'ERROR_INTERNO' } });
    expect(serializado).not.toContain('SQL');
    expect(serializado).not.toContain('masterkey');
    expect(serializado).not.toContain('at ');
  });

  it('normalizarError conserva un ErrorTool tal cual', () => {
    const error = new ErrorTool('BASE_NO_DISPONIBLE', 'La base no responde');
    expect(normalizarError(error)).toBe(error);
  });

  it('el esquema de error enumera los códigos del servidor en el orden dado', () => {
    const codigos = ['PARAMETRO_INVALIDO', 'RECURSO_NO_ENCONTRADO', 'NO_AUTORIZADO', 'BASE_NO_DISPONIBLE', 'ERROR_INTERNO'];
    expect(esquemaError(codigos).properties.codigo.enum).toEqual(codigos);
  });
});

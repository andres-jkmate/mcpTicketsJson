import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { crearLogger } from './logger.js';

function capturar() {
  const lineas: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lineas.push(chunk.toString());
      cb();
    },
  });
  return { lineas, stream };
}

const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.secreto.firma';

describe('logger', () => {
  it('no serializa el bearer token en ninguna de sus formas', () => {
    const { lineas, stream } = capturar();
    const logger = crearLogger({ app: 'mcp-prueba', LOG_LEVEL: 'info', SEQ_URL: undefined, SEQ_API_KEY: undefined }, stream);

    logger.info({ authorization: `Bearer ${TOKEN}` }, 'directo');
    logger.info({ headers: { authorization: `Bearer ${TOKEN}` } }, 'headers');
    logger.info({ req: { headers: { authorization: `Bearer ${TOKEN}`, host: 'x' } } }, 'req');
    logger.info({ token: TOKEN }, 'token');

    const salida = lineas.join('');
    expect(lineas).toHaveLength(4);
    expect(salida).not.toContain(TOKEN);
    expect(salida).toContain('[REDACTADO]');
    expect(salida).toContain('"host":"x"');
  });

  it('respeta el nivel configurado', () => {
    const { lineas, stream } = capturar();
    const logger = crearLogger({ app: 'mcp-prueba', LOG_LEVEL: 'warn', SEQ_URL: undefined, SEQ_API_KEY: undefined }, stream);
    logger.info('no sale');
    logger.warn('sale');
    expect(lineas).toHaveLength(1);
  });

  it('cada evento lleva el nombre de la app', () => {
    const { lineas, stream } = capturar();
    crearLogger({ app: 'mcp-prueba', LOG_LEVEL: 'info' }, stream).info('hola');
    expect(JSON.parse(lineas[0]!)).toMatchObject({ app: 'mcp-prueba', msg: 'hola' });
  });
});

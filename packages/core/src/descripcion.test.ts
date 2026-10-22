import { describe, expect, it } from 'vitest';
import { verificarDescripcion } from './descripcion.js';
import { problemasDeDescripcion } from './pruebas.js';

const COMPLETA = [
  'Qué hace: devuelve el detalle de un cliente.',
  'Cuándo usarla: antes de responder una consulta sobre un cliente puntual.',
  'Parámetros: clienteId, el código del cliente (ej.: 1234).',
  'Qué NO hacer: no la uses para buscar por nombre; para eso está buscar_clientes.',
].join('\n');

describe('verificarDescripcion', () => {
  it('una descripción completa no tiene problemas', () => {
    expect(verificarDescripcion(COMPLETA)).toEqual([]);
  });

  it('informa la parte que falta', () => {
    const sinQueNoHacer = COMPLETA.split('\n').slice(0, 3).join('\n');
    expect(verificarDescripcion(sinQueNoHacer)).toEqual(['falta "Qué NO hacer"']);
  });

  it('informa las partes desordenadas', () => {
    const [queHace, cuando, parametros, queNo] = COMPLETA.split('\n');
    expect(verificarDescripcion([cuando, queHace, parametros, queNo].join('\n'))).toEqual(['"Cuándo usarla" está antes de "Qué hace"']);
  });

  it('exige un ejemplo en "Parámetros"', () => {
    const sinEjemplo = COMPLETA.replace(' (ej.: 1234)', '');
    expect(verificarDescripcion(sinEjemplo)).toEqual(['falta un ejemplo en "Parámetros" (ej.: …)']);
    expect(verificarDescripcion(COMPLETA.replace('(ej.: 1234)', 'por ejemplo 1234'))).toEqual([]);
  });

  it('una tool sin parámetros escribe "Parámetros: ninguno." y no necesita ejemplo', () => {
    const sinParametros = COMPLETA.replace(/^Parámetros: .*$/m, 'Parámetros: ninguno.');
    expect(verificarDescripcion(sinParametros)).toEqual([]);
  });

  it('un rótulo en medio de una línea no cuenta', () => {
    expect(verificarDescripcion(`Devuelve datos. Qué hace: nada.\n${COMPLETA.split('\n').slice(1).join('\n')}`)).toEqual([
      'falta "Qué hace"',
    ]);
  });
});

describe('problemasDeDescripcion', () => {
  it('nombra cada tool que no cumple junto con sus problemas', () => {
    expect(
      problemasDeDescripcion([
        { name: 'obtener_cliente', description: COMPLETA },
        { name: 'listar_clientes', description: 'Lista clientes.' },
      ]),
    ).toEqual([
      {
        tool: 'listar_clientes',
        problemas: ['falta "Qué hace"', 'falta "Cuándo usarla"', 'falta "Parámetros"', 'falta "Qué NO hacer"'],
      },
    ]);
  });
});

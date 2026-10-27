import { describe, expect, it } from 'vitest';
import { relojDesdeTexto, type Fila, type ValorParametro } from '@mcp-jkmate/firebird';
import { crearBuscarMovimientosFondos, type ResultadoBusqueda } from '../src/tools/buscar-movimientos-fondos.js';
import { accesoSimulado, conectarCliente, SESION_PRUEBA, type ManejadorSp } from './apoyo.js';

const HOY = '2026-10-26';
const SP = 'PROC_LIST_MOV_FONDOS_AG';

function fila(id: number, extra: Partial<Fila> = {}): Fila {
  return {
    COD_MOVIMIENTO_FONDO: id,
    NRO_COMPROBANTE: 'X-0001-00009463',
    TALONARIO: 'Orden de pago JK                                  ',
    TIPO: 'Pago a prove JKMT',
    CLASE: 'pago      ',
    FECHA: relojDesdeTexto('2026-09-02'),
    TOTAL: 87260.45,
    TERCERO: 'TELECOM ARGENTINA S.A',
    CONCEPTO: 'Pago a prove JKMT',
    ESTADO: 'vigente',
    ...extra,
  };
}

/** Simula el SP: aplica el paginado (los dos últimos parámetros) sobre las coincidencias dadas. */
function spCon(coincidencias: Fila[]): ManejadorSp {
  return (p: ValorParametro[]) => {
    const [limite, desde] = p.slice(-2) as [number, number];
    const pagina = coincidencias.slice(desde, desde + limite).map((f) => ({ ENCONTRADOS: coincidencias.length, ...f }));
    return pagina.length || !coincidencias.length ? pagina : [{ ENCONTRADOS: coincidencias.length, COD_MOVIMIENTO_FONDO: null }];
  };
}

async function buscar(argumentos: Record<string, unknown>, manejador: ManejadorSp = spCon([])) {
  const { acceso, llamadas } = accesoSimulado({ [SP]: manejador });
  const { cliente } = await conectarCliente([crearBuscarMovimientosFondos({ acceso, hoy: () => HOY })]);
  await cliente.listTools(); // el cliente valida structuredContent contra el outputSchema
  const resultado = await cliente.callTool({ name: 'buscar_movimientos_fondos', arguments: argumentos });
  return { resultado, datos: resultado.structuredContent as unknown as ResultadoBusqueda, llamadas };
}

describe('buscar_movimientos_fondos', () => {
  it('"quiero ver el movimiento X1 9463": número normalizado y sin rango de fechas', async () => {
    const { resultado, datos, llamadas } = await buscar({ numero: 'X1 9463' }, spCon([fila(104923)]));
    expect(resultado.isError).toBeFalsy();
    expect(llamadas).toEqual([
      { nombre: SP, parametros: [SESION_PRUEBA.codUsuario, 'X-0001-00009463', null, null, null, null, null, null, null, 20, 0], escritura: false },
    ]);
    expect(datos).toEqual({
      criterio: { numero: 'X-0001-00009463', fechaDesde: null, fechaHasta: null, importeMin: null, importeMax: null, clase: null, tercero: null },
      encontrados: 1,
      desde: 0,
      truncado: false,
      movimientos: [
        {
          id: 104923,
          numero: 'X-0001-00009463',
          talonario: 'Orden de pago JK',
          tipo: 'Pago a prove JKMT',
          clase: 'pago',
          fecha: '2026-09-02',
          total: 87260.45,
          tercero: 'TELECOM ARGENTINA S.A',
          concepto: 'Pago a prove JKMT',
          estado: 'vigente',
        },
      ],
    });
  });

  it('"¿qué pagos hice ayer?": periodo resuelto por el servidor y clase', async () => {
    const { datos, llamadas } = await buscar({ periodo: 'ayer', clase: 'pago' });
    expect(llamadas[0]!.parametros).toEqual([SESION_PRUEBA.codUsuario, null, '2026-10-25', '2026-10-25', null, null, null, 'pago', null, 20, 0]);
    expect(datos.criterio).toMatchObject({ fechaDesde: '2026-10-25', fechaHasta: '2026-10-25', clase: 'pago' });
  });

  it('"un movimiento de 500000 que hice este mes": importe ±5 % desde el día 1', async () => {
    const { datos, llamadas } = await buscar({ periodo: 'este_mes', importe: 500000 });
    expect(llamadas[0]!.parametros).toEqual([SESION_PRUEBA.codUsuario, null, '2026-10-01', '2026-10-26', 500000, 475000, 525000, null, null, 20, 0]);
    expect(datos.criterio).toMatchObject({ fechaDesde: '2026-10-01', fechaHasta: '2026-10-26', importeMin: 475000, importeMax: 525000 });
  });

  it('sin criterios: el último mes; el tercero va recortado', async () => {
    const { datos, llamadas } = await buscar({ tercero: ' telecom ', importe: 500000, importeExacto: true });
    expect(llamadas[0]!.parametros).toEqual([SESION_PRUEBA.codUsuario, null, '2026-09-26', '2026-10-26', 500000, 500000, 500000, null, 'telecom', 20, 0]);
    expect(datos.criterio).toMatchObject({ tercero: 'telecom', importeMin: 500000, importeMax: 500000 });
  });

  it('sin resultados no es un error', async () => {
    const { resultado, datos } = await buscar({ numero: '9463' });
    expect(resultado.isError).toBeFalsy();
    expect(datos).toMatchObject({ encontrados: 0, truncado: false, movimientos: [], criterio: { numero: '?-????-00009463' } });
  });

  it('paginado: 35 coincidencias con límite 20 y después desde 20', async () => {
    const coincidencias = Array.from({ length: 35 }, (_, i) => fila(105000 - i));
    const primera = await buscar({ limite: 20 }, spCon(coincidencias));
    expect(primera.datos).toMatchObject({ encontrados: 35, desde: 0, truncado: true });
    expect(primera.datos.movimientos).toHaveLength(20);

    const segunda = await buscar({ limite: 20, desde: 20 }, spCon(coincidencias));
    expect(segunda.datos).toMatchObject({ encontrados: 35, desde: 20, truncado: false });
    expect(segunda.datos.movimientos.map((m) => m.id)).toEqual(coincidencias.slice(20).map((f) => f.COD_MOVIMIENTO_FONDO));
  });

  it('una página más allá del final conserva el total', async () => {
    const { datos } = await buscar({ desde: 40 }, spCon(Array.from({ length: 35 }, (_, i) => fila(i + 1))));
    expect(datos).toMatchObject({ encontrados: 35, desde: 40, truncado: false, movimientos: [] });
  });

  it('usuario dado de baja → NO_AUTORIZADO desde el SP', async () => {
    const { resultado } = await buscar({}, () => [{ RESULTADO: 0, MENSAJE_ERROR: 'NO_AUTORIZADO: el usuario configurado no existe o está dado de baja' }]);
    expect(resultado.isError).toBe(true);
    expect(resultado.structuredContent).toMatchObject({ error: { codigo: 'NO_AUTORIZADO', mensaje: 'el usuario configurado no existe o está dado de baja' } });
  });

  it.each([
    [{ clase: 'transferencia' }],
    [{ numero: 'abc' }],
    [{ periodo: 'ayer', fechaDesde: '2026-10-01' }],
    [{ fechaDesde: '2026-10-14', fechaHasta: '2026-10-13' }],
    [{ fechaDesde: '2026-02-30' }],
    [{ limite: 51 }],
  ])('%o → PARAMETRO_INVALIDO sin tocar la base', async (argumentos) => {
    const { resultado, llamadas } = await buscar(argumentos);
    expect(resultado.isError).toBe(true);
    expect(resultado.structuredContent).toMatchObject({ error: { codigo: 'PARAMETRO_INVALIDO' } });
    expect(llamadas).toHaveLength(0);
  });

  it('el número ilegible explica el motivo', async () => {
    const { resultado } = await buscar({ numero: 'abc' });
    expect(resultado.structuredContent).toMatchObject({ error: { mensaje: expect.stringContaining('No se reconoce el número') } });
  });

  it('nunca usa una transacción de escritura', async () => {
    const { llamadas } = await buscar({ numero: 'X1 9463' }, spCon([fila(104923)]));
    expect(llamadas.every((l) => !l.escritura)).toBe(true);
  });
});

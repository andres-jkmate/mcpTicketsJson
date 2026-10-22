import { afterAll, describe, expect, it } from 'vitest';
import { aFechaHoraIso, type AccesoDatos } from '@mcp-jkmate/firebird';
import { codDesarrolladorDeUsuario } from '../../src/db/usuarios.js';
import { accesoDesdeEntorno, hayBase } from './base.js';

describe.skipIf(!hayBase)('acceso a Firebird (integración contra la base de desarrollo)', () => {
  let acceso: AccesoDatos;

  afterAll(async () => {
    await acceso?.cerrar();
  });

  it('ejecuta un SP de la v1 dentro de una transacción de solo lectura y cuenta las llamadas', async () => {
    acceso = accesoDesdeEntorno();
    const medidor = { llamadasBase: 0 };
    const [detalle, adjuntos] = await acceso.enTransaccion(
      (sp) => Promise.all([sp('PROC_GET_INFO_TICKET_PORTAL', [74836]), sp('PROC_GET_ARCHIVO_ADJ_SAC_X_RECL', [74836])]),
      medidor,
    );
    expect(medidor.llamadasBase).toBe(2);
    expect(detalle).toHaveLength(1);
    const fila = detalle[0]!;
    expect(fila.ESTADO).toBeTypeOf('string');
    expect(aFechaHoraIso(fila.FECHA_CREACION as Date, 'America/Argentina/Buenos_Aires')).toBe(
      '2026-09-28T15:44:11.925-03:00',
    );
    expect(adjuntos).toHaveLength(2);
  });

  it('translitera ISO8859_1 a UTF8 sin mojibake', async () => {
    const hitos = await acceso.enTransaccion((sp) => sp('PROC_GET_HITOS_TICKET_PORTAL', [74111, 0]));
    const resultados = hitos.map((h) => h.RESULTADO_RECLAMO as string);
    expect(resultados).toContain('PRESUPUESTO PENDIENTE APROBACIÓN');
    expect(JSON.stringify(hitos)).not.toMatch(/Ã/);
  });

  it('resuelve el desarrollador del usuario de la sesión', async () => {
    expect(await codDesarrolladorDeUsuario(acceso, 15169)).toBe(100936);
  });

  it('la transacción es de solo lectura', async () => {
    const error = await acceso
      .enTransaccion((sp) => sp('PROC_GET_INFO_TICKET_PORTAL', [74836]).then(() => sp('NO_EXISTE_SP_AG', [])))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
  });
});

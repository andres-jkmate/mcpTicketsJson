import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigFirebird } from './acceso.js';

/*
 * node-firebird simulado: una conexión con una transacción que registra lo que pasa. Cada test
 * decide qué SP falla y si falla el commit.
 */
const estado = vi.hoisted(() => ({
  eventos: [] as string[],
  opciones: [] as unknown[],
  fallaSp: null as string | null,
  fallaCommit: false,
}));

vi.mock('node-firebird', () => {
  const transaccion = {
    async queryAsync(sql: string) {
      estado.eventos.push(sql);
      if (estado.fallaSp && sql.includes(estado.fallaSp)) throw new Error(`falló ${estado.fallaSp}`);
      return [{ RESULTADO: 1 }];
    },
    async commitAsync() {
      estado.eventos.push('commit');
      if (estado.fallaCommit) throw new Error('deadlock al confirmar');
    },
    async rollbackAsync() {
      estado.eventos.push('rollback');
    },
  };
  const db = {
    async transactionAsync(opciones: unknown) {
      estado.opciones.push(opciones);
      return transaccion;
    },
    detach() {},
  };
  const pool = () => ({ on() {}, getAsync: async () => db, destroyAsync: async () => undefined });
  return {
    default: { pool, ISOLATION_READ_COMMITTED: ['rc'], ISOLATION_REPEATABLE_READ: ['rr'] },
  };
});

const { crearAccesoFirebird } = await import('./acceso.js');

const CONFIG: ConfigFirebird = {
  FIREBIRD_HOST: '127.0.0.1',
  FIREBIRD_PORT: 3050,
  FIREBIRD_DATABASE: 'simulada.fdb',
  FIREBIRD_USER: 'SYSDBA',
  FIREBIRD_POOL_MAX: 1,
};

beforeEach(() => {
  estado.eventos = [];
  estado.opciones = [];
  estado.fallaSp = null;
  estado.fallaCommit = false;
});

describe('transacción de escritura (node-firebird simulado)', () => {
  it('abre READ COMMITTED de escritura con espera y confirma si todo termina bien', async () => {
    const acceso = crearAccesoFirebird(CONFIG);
    const medidor = { llamadasBase: 0 };
    await acceso.enTransaccionEscritura(async (sp) => {
      await sp('PROC_A_AG', [1]);
      await sp('PROC_B_AG', [2]);
    }, medidor);
    expect(estado.opciones).toEqual([{ isolation: ['rc'], readOnly: false, wait: true }]);
    expect(estado.eventos).toEqual(['SELECT * FROM PROC_A_AG(?)', 'SELECT * FROM PROC_B_AG(?)', 'commit']);
    expect(medidor.llamadasBase).toBe(2);
  });

  it('un error en el segundo SP revierte y llega a quien llamó', async () => {
    estado.fallaSp = 'PROC_B_AG';
    const acceso = crearAccesoFirebird(CONFIG);
    const error = await acceso
      .enTransaccionEscritura(async (sp) => {
        await sp('PROC_A_AG', [1]);
        await sp('PROC_B_AG', [2]);
      })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ message: 'falló PROC_B_AG' });
    expect(estado.eventos).toEqual(['SELECT * FROM PROC_A_AG(?)', 'SELECT * FROM PROC_B_AG(?)', 'rollback']);
  });

  it('un commit que falla revierte y propaga el error', async () => {
    estado.fallaCommit = true;
    const acceso = crearAccesoFirebird(CONFIG);
    const error = await acceso.enTransaccionEscritura((sp) => sp('PROC_A_AG', [1])).catch((e: unknown) => e);
    expect(error).toMatchObject({ message: 'deadlock al confirmar' });
    expect(estado.eventos).toEqual(['SELECT * FROM PROC_A_AG(?)', 'commit', 'rollback']);
  });

  it('la transacción de lectura no cambia: solo lectura y un commit fallido se descarta', async () => {
    estado.fallaCommit = true;
    const acceso = crearAccesoFirebird(CONFIG);
    await expect(acceso.enTransaccion((sp) => sp('PROC_A_AG', [1]))).resolves.toEqual([{ RESULTADO: 1 }]);
    expect(estado.opciones).toEqual([{ isolation: ['rr'], readOnly: true, wait: false }]);
  });
});

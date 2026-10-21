import { describe, expect, it } from 'vitest';
import { accesoSimulado, conectarCliente, r, type ManejadorSp } from '../../test/apoyo.js';
import { tareaSimulada } from '../../test/datos/ticket-74836.js';
import type { Sesion } from '../auth/sesion.js';
import type { Fila } from '../db/firebird.js';
import { aFecha } from '../mapeo/fecha.js';
import { crearListarTareas, type ListadoTareas } from './listar-tareas.js';

const ZONA = 'America/Argentina/Buenos_Aires';

type TareaSimulada = Fila & { ES_DESCANSO?: number };

const ABRIL = { COD_DESARROLLADOR: 1117419, DESARROLLADOR: 'Abril Ocampo', COD_DESARROLLADOR_RESP: null, DESARROLLADOR_RESP: null };
const ROBERTO = { COD_DESARROLLADOR: 100203, DESARROLLADOR: 'Roberto Gomez' };

/** Tareas del #74703 (base de testing) más algunas propias y un descanso. */
const TAREAS: TareaSimulada[] = [
  tareaSimulada(),
  tareaSimulada({ COD_ASIGNACION_JK3: 6249, NOMBRE: 'Generador de asientos de compras: NIT/Proveedor, ver comprobante, imprimir asiento y reorden de grilla', PRIORIDAD: 3, FECHA_HORA_CREA: r('2026-10-07 13:51:56.077'), HORAS_ESTIMADAS: 6, COD_TIPO_ASIGNACION_JK3: null, TIPO_ASIGNACION: null, ...ABRIL }),
  tareaSimulada({ COD_ASIGNACION_JK3: 6250, NOMBRE: 'Ajuste de grilla', ESTADO_ASIGNACION: 'FINALIZADA', PRIORIDAD: 3, FECHA_HORA_CREA: r('2026-10-07 12:00:00'), ...ABRIL }),
  tareaSimulada({ COD_ASIGNACION_JK3: 6251, NOMBRE: 'Revisión', ESTADO_ASIGNACION: 'FINALIZADA', PRIORIDAD: 3, FECHA_HORA_CREA: r('2026-10-07 12:30:00'), ...ROBERTO }),
  tareaSimulada({ COD_ASIGNACION_JK3: 7000, NOMBRE: 'Tarea propia iniciada', ESTADO_ASIGNACION: 'INICIADA', PRIORIDAD: 1, COD_RECLAMO: null, COD_DESARROLLADOR_RESP: 100203, DESARROLLADOR_RESP: 'Roberto Gomez' }),
  tareaSimulada({ COD_ASIGNACION_JK3: 7001, NOMBRE: 'Tarea archivada', ESTADO_ASIGNACION: 'ARCHIVADO', COD_RECLAMO: null }),
  { ...tareaSimulada({ COD_ASIGNACION_JK3: 7002, NOMBRE: 'Almuerzo', ESTADO_ASIGNACION: 'POR INICIAR', COD_RECLAMO: null }), ES_DESCANSO: 1 },
];

/** Emula PROC_LIST_TAREAS_AG con la semántica de PRV_LIST_TAREAS_BASE_AG. */
function tareasSimuladas(tareas: TareaSimulada[] = TAREAS): ManejadorSp {
  return (p) => {
    const [dev, resp, ticket, estados, soloPend, prioridad, desde, hasta, descansos, limite, desplazamiento] = p;
    const filtradas = tareas.filter((t) => {
      if (dev !== null && t.COD_DESARROLLADOR !== dev) return false;
      if (resp !== null && t.COD_DESARROLLADOR_RESP !== resp) return false;
      if (ticket !== null && t.COD_RECLAMO !== ticket) return false;
      if (estados !== null && !String(estados).split(',').includes(String(t.ESTADO_ASIGNACION))) return false;
      if (estados === null && soloPend === 1 && ['FINALIZADA', 'ARCHIVADO'].includes(String(t.ESTADO_ASIGNACION))) return false;
      if (prioridad !== null && t.PRIORIDAD !== prioridad) return false;
      const creada = aFecha(t.FECHA_HORA_CREA as Date);
      if (desde !== null && creada < String(desde)) return false;
      if (hasta !== null && creada > String(hasta)) return false;
      if (descansos !== 1 && t.ES_DESCANSO === 1) return false;
      return true;
    });
    const ordenadas = [...filtradas].sort(
      (a, b) =>
        Number(a.PRIORIDAD) - Number(b.PRIORIDAD) ||
        (b.FECHA_HORA_CREA as Date).getTime() - (a.FECHA_HORA_CREA as Date).getTime() ||
        Number(b.COD_ASIGNACION_JK3) - Number(a.COD_ASIGNACION_JK3),
    );
    return ordenadas
      .slice(Number(desplazamiento), Number(desplazamiento) + Number(limite))
      .map(({ ES_DESCANSO: _d, ...t }) => ({ ...t, TOTAL: filtradas.length }));
  };
}

async function listar(args: Record<string, unknown>, opciones: { tareas?: TareaSimulada[]; sesion?: Sesion } = {}) {
  const { acceso, llamadas } = accesoSimulado({ PROC_LIST_TAREAS_AG: tareasSimuladas(opciones.tareas) });
  const { cliente } = await conectarCliente([crearListarTareas({ acceso, zonaHoraria: ZONA })], opciones.sesion);
  await cliente.listTools();
  const resultado = await cliente.callTool({ name: 'listar_tareas', arguments: args });
  const texto = (resultado.content as { text: string }[])[0]?.text ?? '';
  return { resultado, datos: resultado.structuredContent as unknown as ListadoTareas, llamadas, texto };
}

const error = (r: unknown) => (r as { structuredContent?: { error?: { codigo: string; mensaje: string } } }).structuredContent?.error;

describe('listar_tareas', () => {
  it('tareas de un ticket', async () => {
    const { datos } = await listar({ ticketId: 74703, soloPendientes: false });
    expect(datos.total).toBe(4);
    expect(new Set(datos.tareas.map((t) => t.desarrollador?.id))).toEqual(new Set([100936, 1117419, 100203]));
    expect(datos.tareas.every((t) => t.ticketId === 74703)).toBe(true);
  });

  it('elemento de la lista: forma común, sin descripción por defecto', async () => {
    const { datos } = await listar({ ticketId: 74703, soloPendientes: false, limite: 2 });
    expect(datos).toMatchObject({ total: 4, limite: 2, desplazamiento: 0, hayMas: true });
    expect(datos.tareas[0]).toEqual({
      id: 6248,
      nombre: 'Asientos de compras sin nombre del Proveedor',
      estado: 'FINALIZA DESARROLLO',
      prioridad: 2,
      tipo: { id: 1, nombre: 'DESARROLLO' },
      ticketId: 74703,
      desarrollador: { id: 100936, nombre: 'Andres Pelaez' },
      responsable: { id: 100936, nombre: 'Andres Pelaez' },
      horasEstimadas: 2,
      fechaCompromiso: null,
      creadaEn: '2026-10-07T11:29:47.440-03:00',
    });
    expect(datos.tareas[1]).toMatchObject({ id: 6249, tipo: null, responsable: null, desarrollador: { id: 1117419, nombre: 'Abril Ocampo' } });
  });

  it('nombre de persona del desarrollador', async () => {
    const { datos } = await listar({ ticketId: 74703 });
    expect(datos.tareas.find((t) => t.id === 6248)?.desarrollador).toEqual({ id: 100936, nombre: 'Andres Pelaez' });
  });

  it('descripción a pedido', async () => {
    const { datos } = await listar({ ticketId: 74703, incluirDescripcion: true });
    expect(datos.tareas.every((t) => 'descripcion' in t)).toBe(true);
    expect(datos.tareas[0]?.descripcion).toBe('Detalle largo de la tarea');
  });

  it('solo pendientes por defecto (FINALIZA DESARROLLO cuenta como pendiente)', async () => {
    const { datos } = await listar({ ticketId: 74703 });
    expect(datos.tareas.map((t) => t.estado)).toEqual(['FINALIZA DESARROLLO', 'FINALIZA DESARROLLO']);
  });

  it('estados explícitos ignoran soloPendientes', async () => {
    const { datos } = await listar({ ticketId: 74703, estados: ['FINALIZADA'] });
    expect(datos.tareas.map((t) => t.id)).toEqual([6251, 6250]);
  });

  it('estado de tarea inexistente → PARAMETRO_INVALIDO', async () => {
    expect(error((await listar({ estados: ['EN_CURSO'] })).resultado)?.codigo).toBe('PARAMETRO_INVALIDO');
  });

  it('por responsable distinto del asignado', async () => {
    const { datos, llamadas } = await listar({ responsable: 100203 });
    expect(llamadas[0]?.parametros.slice(0, 3)).toEqual([null, 100203, null]);
    expect(datos.tareas).toHaveLength(1);
    expect(datos.tareas[0]).toMatchObject({ desarrollador: { id: 100936 }, responsable: { id: 100203 } });
  });

  it('sin filtros de persona ni ticket: las tareas del desarrollador de la sesión', async () => {
    const { datos, llamadas } = await listar({});
    expect(llamadas[0]?.parametros[0]).toBe(100936);
    expect(datos.tareas.length).toBeGreaterThan(0);
    expect(datos.tareas.every((t) => t.desarrollador?.id === 100936)).toBe(true);
  });

  it('"yo" en responsable usa el desarrollador de la sesión', async () => {
    const { llamadas } = await listar({ responsable: 'yo' });
    expect(llamadas[0]?.parametros.slice(0, 2)).toEqual([null, 100936]);
  });

  it('"yo" equivale al código del desarrollador de la sesión', async () => {
    const conYo = await listar({ desarrollador: 'yo', soloPendientes: false });
    const conCodigo = await listar({ desarrollador: 100936, soloPendientes: false });
    expect(conYo.datos).toEqual(conCodigo.datos);
  });

  it('descansos excluidos salvo que se pidan', async () => {
    expect((await listar({})).datos.tareas.map((t) => t.nombre)).not.toContain('Almuerzo');
    expect((await listar({ incluirDescansos: true })).datos.tareas.map((t) => t.nombre)).toContain('Almuerzo');
  });

  it('usuario sin desarrollador asociado', async () => {
    const sesion = { codUsuario: 22, codDesarrollador: null };
    for (const args of [{}, { desarrollador: 'yo' }, { responsable: 'yo' }]) {
      const { resultado, llamadas } = await listar(args, { sesion });
      expect(error(resultado)?.codigo).toBe('PARAMETRO_INVALIDO');
      expect(error(resultado)?.mensaje).toContain('no tiene un desarrollador asociado');
      expect(llamadas).toHaveLength(0);
    }
    // por ticket sí puede consultar
    expect((await listar({ ticketId: 74703 }, { sesion })).resultado.isError).toBeFalsy();
  });

  it('tarea sin desarrollador asignado', async () => {
    const tareas = [tareaSimulada({ COD_DESARROLLADOR: null, DESARROLLADOR: null })];
    const { datos, resultado } = await listar({ ticketId: 74703 }, { tareas });
    expect(resultado.isError).toBeFalsy();
    expect(datos.tareas[0]?.desarrollador).toBeNull();
  });

  it('total informado y orden por prioridad y creación descendente', async () => {
    const tareas = Array.from({ length: 30 }, (_, i) =>
      tareaSimulada({ COD_ASIGNACION_JK3: 9000 + i, PRIORIDAD: i % 3, FECHA_HORA_CREA: new Date(Date.UTC(2026, 9, 1, i)) }),
    );
    const { datos } = await listar({ limite: 10 }, { tareas });
    expect(datos).toMatchObject({ total: 30, hayMas: true });
    expect(datos.tareas).toHaveLength(10);
    expect(datos.tareas.map((t) => t.prioridad)).toEqual(Array(10).fill(0));
    expect(datos.tareas[0]?.id).toBe(9027);
  });

  it('desplazamiento mayor al total: informa el total', async () => {
    const { datos, llamadas } = await listar({ ticketId: 74703, soloPendientes: false, desplazamiento: 50 });
    expect(datos).toMatchObject({ total: 4, hayMas: false, tareas: [] });
    expect(llamadas).toHaveLength(2);
  });

  it('resumen en texto', async () => {
    const { texto } = await listar({ ticketId: 74703, soloPendientes: false, limite: 2 });
    expect(texto).toBe(
      '4 tareas (mostrando 1–2). #6248 FINALIZA DESARROLLO p2 "Asientos de compras sin nombre del Proveedor" (Andres Pelaez); ' +
        '#6249 FINALIZA DESARROLLO p3 "Generador de asientos de compras: NIT/Proveedor,…" (Abril Ocampo).',
    );
  });

  it('rango de creación invertido → PARAMETRO_INVALIDO', async () => {
    expect(error((await listar({ creadaDesde: '2026-10-02', creadaHasta: '2026-10-01' })).resultado)?.codigo).toBe('PARAMETRO_INVALIDO');
  });
});

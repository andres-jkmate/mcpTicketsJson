/**
 * Acceso de solo lectura a la base de prueba para el arnés (design D6 y D8): verdad de referencia
 * de cada caso, existencia de tickets y desarrolladores, y resolución de personaRef { nombre }.
 *
 * Los SP se ejecutan con la capa src/db de la v2 (transacción de solo lectura). Los desarrolladores
 * no tienen SP en la v2: se leen con una consulta directa, también en una transacción de solo lectura.
 */
import Firebird from 'node-firebird';
import type { Config } from '../../src/config.js';
import { crearAccesoFirebird, type AccesoDatos } from '@mcp-jkmate/firebird';
import { listarTareas, listarTickets, obtenerTicket } from '../../src/db/sp.js';
import { codDesarrolladorDeUsuario } from '../../src/db/usuarios.js';
import type { Caso } from './casos.js';

/** Más de esta cantidad, el verificador acepta el total en lugar de todos los ids (D8). */
export const LIMITE_IDS = 25;

export interface Desarrollador {
  id: number;
  nombre: string;
  alias: string | null;
  activo: boolean;
  /** USUARIOS.NOMBRE de los usuarios vinculados (suelen tener el nombre y apellido). */
  nombresUsuario: string[];
}

export interface Listado {
  ids: number[];
  total: number;
}

export interface VerdadReferencia {
  codUsuario: number;
  codDesarrollador: number;
  'estado-ticket'?: { ticketId: number; estado: string; resultado: string; tareasAbiertas: number[] };
  'mis-tickets-agendados'?: Listado;
  'mis-tareas-pendientes'?: Listado;
  'crear-tarea'?: { ticketId: number; desarrolladorId: number };
  'prioridad-mensaje'?: { ticketId: number; prioridad: string };
}

/** Lo que el interceptor necesita de la base (se simula en los tests). */
export interface ConsultasReferenciales {
  existeTicket(id: number): Promise<boolean>;
  existeDesarrollador(id: number): Promise<boolean>;
  /** Desarrolladores activos que coinciden con el nombre (0, 1 o varios). */
  buscarDesarrolladores(nombre: string): Promise<Desarrollador[]>;
}

export interface BaseLectura extends ConsultasReferenciales {
  acceso: AccesoDatos;
  desarrolladores(): Promise<Desarrollador[]>;
  cerrar(): Promise<void>;
}

/** Mayúsculas sin tildes ni signos: "Gustavo Oviedo" → "GUSTAVO OVIEDO". */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/**
 * Coinciden los desarrolladores activos en los que todas las palabras del nombre buscado aparecen
 * en su nombre, su alias o el nombre de alguno de sus usuarios. Si alguno coincide por nombre o
 * alias exactos, gana ese.
 */
export function coincidencias(desarrolladores: Desarrollador[], nombre: string): Desarrollador[] {
  const buscado = normalizar(nombre);
  if (!buscado) return [];
  const palabras = buscado.split(' ');
  const activos = desarrolladores.filter((d) => d.activo);
  const exactos = activos.filter((d) => [d.nombre, d.alias, ...d.nombresUsuario].some((t) => t && normalizar(t) === buscado));
  if (exactos.length) return exactos;
  return activos.filter((d) =>
    [d.nombre, d.alias, ...d.nombresUsuario].some((t) => {
      const texto = t ? normalizar(t) : '';
      return palabras.every((p) => texto.includes(p));
    }),
  );
}

type ConfigBase = Pick<Config, 'FIREBIRD_HOST' | 'FIREBIRD_PORT' | 'FIREBIRD_DATABASE' | 'FIREBIRD_USER' | 'FIREBIRD_PASSWORD'>;

async function leerDesarrolladores(config: ConfigBase): Promise<Desarrollador[]> {
  const db = await Firebird.attachAsync({
    host: config.FIREBIRD_HOST,
    port: config.FIREBIRD_PORT,
    database: config.FIREBIRD_DATABASE,
    user: config.FIREBIRD_USER,
    password: config.FIREBIRD_PASSWORD ?? '',
    encoding: 'UTF8',
  });
  try {
    const tx = await db.transactionAsync({ isolation: Firebird.ISOLATION_READ_COMMITTED_READ_ONLY, readOnly: true, wait: false });
    try {
      const filas = await tx.queryAsync<{ ID: number; NOMBRE: string | null; ALIAS: string | null; ACTIVO: number | null; USUARIO: string | null }>(
        `SELECT D.COD_DESARROLLADOR AS ID, TRIM(D.NOMBRE) AS NOMBRE, TRIM(D.ALIAS) AS ALIAS, D.ACTIVO,
                TRIM(U.NOMBRE) AS USUARIO
           FROM DESARROLLADORES D
           LEFT JOIN USUARIOS U ON U.COD_DESARROLLADOR = D.COD_DESARROLLADOR AND U.FECHA_BAJA IS NULL`,
        [],
      );
      const porId = new Map<number, Desarrollador>();
      for (const f of filas) {
        const d = porId.get(f.ID) ?? { id: f.ID, nombre: f.NOMBRE ?? '', alias: f.ALIAS || null, activo: f.ACTIVO === 1, nombresUsuario: [] };
        if (f.USUARIO && !d.nombresUsuario.includes(f.USUARIO)) d.nombresUsuario.push(f.USUARIO);
        porId.set(f.ID, d);
      }
      return [...porId.values()];
    } finally {
      await tx.rollbackAsync().catch(() => undefined);
    }
  } finally {
    await db.detachAsync();
  }
}

export function abrirBase(config: ConfigBase): BaseLectura {
  const acceso = crearAccesoFirebird({ ...config, FIREBIRD_POOL_MAX: 2 });
  let cache: Promise<Desarrollador[]> | undefined;
  const desarrolladores = () => (cache ??= leerDesarrolladores(config));
  const tickets = new Map<number, Promise<boolean>>();
  return {
    acceso,
    desarrolladores,
    existeTicket(id) {
      if (!tickets.has(id)) tickets.set(id, acceso.enTransaccion((sp) => obtenerTicket(sp, id)).then((t) => t !== null));
      return tickets.get(id)!;
    },
    async existeDesarrollador(id) {
      return (await desarrolladores()).some((d) => d.id === id);
    },
    async buscarDesarrolladores(nombre) {
      return coincidencias(await desarrolladores(), nombre);
    },
    cerrar: () => acceso.cerrar(),
  };
}

/** Recorre todas las páginas de un SP de listado (límite de 100 por página). */
async function todas<F extends { TOTAL: number }>(pagina: (limite: number, desplazamiento: number) => Promise<F[]>): Promise<{ filas: F[]; total: number }> {
  const filas: F[] = [];
  let total = 0;
  do {
    const lote = await pagina(100, filas.length);
    total = lote[0]?.TOTAL ?? total;
    filas.push(...lote);
    if (!lote.length) break;
  } while (filas.length < total);
  return { filas, total };
}

/** Obtiene una vez, al empezar, los datos esperados de cada caso (D8). Solo lectura. */
export async function obtenerReferencia(base: BaseLectura, casos: Caso[], codUsuario: number): Promise<VerdadReferencia> {
  const codDesarrollador = await codDesarrolladorDeUsuario(base.acceso, codUsuario);
  if (codDesarrollador === null) throw new Error(`El usuario ${codUsuario} no es desarrollador: no se pueden armar los casos de tareas`);
  const ref: VerdadReferencia = { codUsuario, codDesarrollador };

  await base.acceso.enTransaccion(async (sp) => {
    for (const caso of casos) {
      switch (caso.id) {
        case 'estado-ticket': {
          const ticket = await obtenerTicket(sp, caso.ticketId);
          if (!ticket) throw new Error(`El ticket ${caso.ticketId} del caso ${caso.id} no existe`);
          const { filas: tareas } = await todas((limite, desplazamiento) =>
            listarTareas(sp, { codReclamo: caso.ticketId, soloPendientes: true, limite, desplazamiento }),
          );
          ref[caso.id] = {
            ticketId: caso.ticketId,
            estado: ticket.ESTADO.trim(),
            resultado: ticket.RESULTADO_RECLAMO?.trim() ?? '',
            tareasAbiertas: tareas.map((t) => t.COD_ASIGNACION_JK3),
          };
          break;
        }
        case 'mis-tickets-agendados': {
          const { filas, total } = await todas((limite, desplazamiento) =>
            listarTickets(sp, { estados: ['AGENDADO'], codUsuarioAsignado: codUsuario, orden: 'actualizacion', limite, desplazamiento }),
          );
          ref[caso.id] = { ids: filas.map((f) => f.COD_RECLAMO), total };
          break;
        }
        case 'mis-tareas-pendientes': {
          const { filas, total } = await todas((limite, desplazamiento) =>
            listarTareas(sp, { codDesarrollador, soloPendientes: true, limite, desplazamiento }),
          );
          ref[caso.id] = { ids: filas.map((f) => f.COD_ASIGNACION_JK3), total };
          break;
        }
        case 'crear-tarea':
        case 'prioridad-mensaje': {
          if (!(await obtenerTicket(sp, caso.ticketId))) throw new Error(`El ticket ${caso.ticketId} del caso ${caso.id} no existe`);
          break;
        }
      }
    }
  });

  for (const caso of casos) {
    if (caso.id === 'crear-tarea') {
      const encontrados = await base.buscarDesarrolladores(caso.desarrollador.nombre);
      if (encontrados.length !== 1 || encontrados[0]!.id !== caso.desarrollador.id) {
        throw new Error(
          `"${caso.desarrollador.nombre}" debe resolver a un único desarrollador (${caso.desarrollador.id}); resolvió a ${encontrados.map((d) => d.id).join(', ') || 'ninguno'}`,
        );
      }
      ref[caso.id] = { ticketId: caso.ticketId, desarrolladorId: caso.desarrollador.id };
    }
    if (caso.id === 'prioridad-mensaje') ref[caso.id] = { ticketId: caso.ticketId, prioridad: caso.prioridad };
  }
  return ref;
}

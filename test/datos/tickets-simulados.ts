import type { Fila, ValorParametro } from '../../src/db/firebird.js';
import { aFecha } from '../../src/mapeo/fecha.js';
import { r, type ManejadorSp } from '../apoyo.js';

/** Ticket de la tabla simulada: lo que PRV_LIST_TICKETS_BASE_AG sabe de cada uno. */
export interface TicketSimulado {
  id: number;
  titulo: string;
  estado: string;
  abierto: boolean;
  prioridad: string;
  sistema: string | null;
  cliente: [number, string];
  asignado: [number, string] | null;
  creado: string;
  actualizado: string;
  pedido?: string;
  mensajes?: string[];
  /** Agendas [fecha, codUsuario, nombre]; la "próxima" es la de fecha más reciente (criterio v1). */
  agendas?: [string, number, string][];
  presupuesto?: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
}

const ANDRES: [number, string] = [15169, 'Andres Pelaez'];
const CAROLINA: [number, string] = [15200, 'Carolina Guerra'];

export const TICKETS: TicketSimulado[] = [
  {
    id: 74836,
    titulo: 'error al cargar asiento',
    estado: 'AGENDADO',
    abierto: true,
    prioridad: 'CRITICA',
    sistema: 'JK3',
    cliente: [502312, 'Suscripciones del Cielo SA'],
    asignado: ANDRES,
    creado: '2026-09-28 15:44:11.925',
    actualizado: '2026-10-05 13:09:35.383',
    mensajes: ['no puedo cargar e3l asiento por un error adjujnto imagen'],
    agendas: [['2026-10-06 09:00:00', 15169, 'Andres Pelaez']],
  },
  {
    id: 74790,
    titulo: 'no imprime factura B',
    estado: 'AGENDADO',
    abierto: true,
    prioridad: 'ALTA',
    sistema: 'JK3',
    cliente: [501877, 'OTRO CLIENTE SRL'],
    asignado: ANDRES,
    creado: '2026-09-25 10:02:00',
    actualizado: '2026-10-02 16:40:12.004',
    presupuesto: 'PENDIENTE',
  },
  {
    id: 74111,
    titulo: 'Configuración de alertas',
    estado: 'PENDIENTE',
    abierto: true,
    prioridad: 'MEDIA',
    sistema: null,
    cliente: [501877, 'OTRO CLIENTE SRL'],
    asignado: CAROLINA,
    creado: '2026-08-10 09:00:00',
    actualizado: '2026-10-07 10:00:00',
    pedido: 'Necesitan una alerta por mail',
    presupuesto: 'PENDIENTE',
  },
  {
    id: 74500,
    titulo: 'consulta stock',
    estado: 'INICIADO',
    abierto: true,
    prioridad: 'BAJA',
    sistema: 'JK2',
    cliente: [500001, 'Cliente Uno'],
    asignado: null,
    creado: '2026-09-15 08:00:00',
    actualizado: '2026-09-15 08:00:00',
    mensajes: ['adjunto una imagen del error'],
    agendas: [['2026-10-20 10:00:00', 15200, 'Carolina Guerra']],
  },
  {
    id: 73000,
    titulo: 'listado de cobranzas',
    estado: 'FINALIZADO',
    abierto: false,
    prioridad: 'BAJA',
    sistema: 'JK3',
    cliente: [500001, 'Cliente Uno'],
    asignado: ANDRES,
    creado: '2026-06-01 08:00:00',
    actualizado: '2026-06-10 08:00:00',
  },
  {
    id: 72000,
    titulo: 'pedido anulado',
    estado: 'CANCELADO',
    abierto: false,
    prioridad: 'SIN ASIGNAR',
    sistema: null,
    cliente: [500002, 'Cliente Dos'],
    asignado: null,
    creado: '2026-05-01 08:00:00',
    actualizado: '2026-05-02 08:00:00',
  },
];

/** Normaliza como ES_ES_CI_AI: sin mayúsculas ni acentos. */
const plano = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const enCsv = (csv: ValorParametro | undefined, valor: string | null) => valor !== null && String(csv).split(',').includes(valor);

function agendaMasReciente(t: TicketSimulado) {
  return [...(t.agendas ?? [])].sort((a, b) => b[0].localeCompare(a[0]))[0];
}

/** Aplica los filtros con la semántica de PRV_LIST_TICKETS_BASE_AG + el filtro de texto del público. */
function filtrar(tickets: TicketSimulado[], p: ValorParametro[]): TicketSimulado[] {
  const [estados, soloAbiertos, prioridades, sistema, asig, agendadoA, cliente, desde, hasta, texto, enMensajes] = p;
  return tickets.filter((t) => {
    if (estados !== null && !enCsv(estados, t.estado)) return false;
    if (estados === null && soloAbiertos === 1 && !t.abierto) return false;
    if (prioridades !== null && !enCsv(prioridades, t.prioridad)) return false;
    if (sistema !== null && t.sistema !== sistema) return false;
    if (asig !== null && t.asignado?.[0] !== asig) return false;
    if (agendadoA !== null && !(t.agendas ?? []).some((a) => a[1] === agendadoA)) return false;
    if (cliente !== null && t.cliente[0] !== cliente) return false;
    const creado = aFecha(r(t.creado));
    if (desde !== null && creado < String(desde)) return false;
    if (hasta !== null && creado > String(hasta)) return false;
    if (texto !== null) {
      const q = plano(String(texto));
      const enTitulo = plano(t.titulo).includes(q) || plano(t.pedido ?? '').includes(q);
      const enMsj = enMensajes === 1 && (t.mensajes ?? []).some((m) => plano(m).includes(q));
      if (!enTitulo && !enMsj) return false;
    }
    return true;
  });
}

function aFila(t: TicketSimulado, total: number): Fila {
  const agenda = agendaMasReciente(t);
  return {
    TOTAL: total,
    COD_RECLAMO: t.id,
    TITULO: t.titulo,
    ESTADO: t.estado,
    PRIORIDAD: t.prioridad,
    TIPO_SISTEMA: t.sistema,
    COD_CLIENTE: t.cliente[0],
    CLIENTE: t.cliente[1],
    COD_USUARIO_ASIG: t.asignado?.[0] ?? null,
    USUARIO_ASIG: t.asignado?.[1] ?? null,
    FECHA_CREACION: r(t.creado),
    FECHA_ULTIMO_CAMBIO: r(t.actualizado),
    AGENDA_FECHA: agenda ? r(agenda[0]) : null,
    AGENDA_COD_USUARIO: agenda?.[1] ?? null,
    AGENDA_USUARIO: agenda?.[2] ?? null,
    ESTADO_PRESUPUESTO: t.presupuesto ?? null,
  };
}

/** Emula PROC_LIST_TICKETS_AG (incluido el error de validación del SP para límites fuera de rango). */
export function listarTicketsSimulado(tickets: TicketSimulado[] = TICKETS): ManejadorSp {
  return (p) => {
    const [orden, limite, desplazamiento] = p.slice(11) as [string, number, number];
    if (limite < 1 || limite > 100) return [{ RESULTADO: 0, MENSAJE_ERROR: 'Límite entre 1 y 100 y desplazamiento >= 0' }];
    const filtrados = filtrar(tickets, p);
    const clave = (t: TicketSimulado) =>
      orden === 'creacion' ? t.creado : orden === 'agenda' ? (agendaMasReciente(t)?.[0] ?? null) : t.actualizado;
    const ordenados = [...filtrados].sort((a, b) => {
      const ka = clave(a);
      const kb = clave(b);
      if (orden === 'agenda') {
        if (ka === null) return kb === null ? b.id - a.id : 1;
        if (kb === null) return -1;
        return ka.localeCompare(kb);
      }
      return (kb ?? '').localeCompare(ka ?? '') || b.id - a.id;
    });
    return ordenados.slice(desplazamiento, desplazamiento + limite).map((t) => aFila(t, filtrados.length));
  };
}

/** Emula PROC_LIST_RESUMEN_TICKETS_AG: GROUP BY de la dimensión, ordenado por cantidad. */
export function resumenSimulado(tickets: TicketSimulado[] = TICKETS): ManejadorSp {
  return ([dimension, ...filtros]) => {
    const filtrados = filtrar(tickets, filtros);
    const grupos = new Map<string, { id: number | null; clave: string | null; cantidad: number }>();
    for (const t of filtrados) {
      const [id, clave] =
        dimension === 'ESTADO'
          ? [null, t.estado]
          : dimension === 'PRIORIDAD'
            ? [null, t.prioridad]
            : dimension === 'SISTEMA'
              ? [null, t.sistema]
              : dimension === 'CLIENTE'
                ? t.cliente
                : (t.asignado ?? [null, null]);
      const k = `${id}|${clave}`;
      const g = grupos.get(k) ?? { id, clave, cantidad: 0 };
      g.cantidad += 1;
      grupos.set(k, g);
    }
    return [...grupos.values()]
      .sort((a, b) => b.cantidad - a.cantidad || String(a.clave).localeCompare(String(b.clave)))
      .map((g) => ({ TOTAL: filtrados.length, CLAVE_ID: g.id, CLAVE: g.clave, CANTIDAD: g.cantidad }));
  };
}

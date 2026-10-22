import { z } from 'zod';
import {
  listarAdjuntosTicket,
  listarAgendasTicket,
  listarHistorial,
  listarPresupuestosTicket,
  listarTareas,
  obtenerTicket,
  type FilaAdjunto,
  type FilaAgenda,
  type FilaHistorial,
  type FilaPresupuesto,
  type FilaTicket,
} from '../db/sp.js';
import { ErrorTool } from '../errores.js';
import { aBooleano, aFecha, aFechaHoraIso, aFechaHoraIsoONull, aPersona, aRefNombre, aTextoONull, htmlATexto, omitirNulos, type Persona, type RefNombre } from '@mcp-jkmate/firebird';
import type { DefinicionTool } from '@mcp-jkmate/core';
import { ANOTACIONES_LECTURA, conDefs, ref, refNullable, TIPOS_HITO } from './esquemas.js';
import type { DependenciasTools } from './index.js';
import { mapearTarea, plural, type Tarea } from './mapeo-comun.js';

/** Máximo de tareas que se traen con el contexto (una página de PROC_LIST_TAREAS_AG). */
const LIMITE_TAREAS = 100;
const SIN_PERSONA: Persona = { id: 0, nombre: 'Sin usuario' };

const entrada = z
  .object({
    ticketId: z.number().int().min(1),
    soloVisibleCliente: z.boolean().default(false),
    limiteHistorial: z.number().int().min(1).max(200).default(50),
  })
  .strict();

type Entrada = z.infer<typeof entrada>;

interface TicketContexto {
  id: number;
  titulo: string;
  estado: string;
  resultado: string;
  prioridad: string;
  sistema: string | null;
  proceso: RefNombre | null;
  cliente: RefNombre;
  contacto: string | null;
  asignadoA: Persona | null;
  creadoEn: string;
  actualizadoEn: string;
  pedidoNormalizado: string | null;
}

interface Movimiento {
  id: number;
  fecha: string;
  tipo: string;
  autor: Persona;
  destinatario?: Persona;
  evento?: string;
  texto: string;
  resultado?: string;
  esDelCliente: boolean;
  visibleCliente: boolean;
  adjuntos: number;
  respondeA?: number;
}

interface Agenda {
  id: number;
  inicio: string;
  fin: string | null;
  todoElDia: boolean;
  realizada: boolean;
  usuario: Persona;
}

interface Presupuesto {
  comprobante: string;
  fecha: string;
  estado: string;
  importe: number;
  aprobadoEn: string | null;
}

interface Adjunto {
  id: number;
  nombre: string;
  url: string;
  mensajeId: number;
  fecha: string;
}

export interface ContextoTicket {
  ticket: TicketContexto;
  totalHistorial: number;
  historial: Movimiento[];
  tareas: Tarea[];
  agendas: Agenda[];
  presupuestos: Presupuesto[];
  adjuntos: Adjunto[];
}

// ---------------------------------------------------------------- mapeo

function mapearTicket(f: FilaTicket, zona: string): TicketContexto {
  return {
    id: f.COD_RECLAMO,
    titulo: f.TITULO.trim(),
    estado: f.ESTADO.trim(),
    resultado: f.RESULTADO_RECLAMO?.trim() ?? '',
    prioridad: f.PRIORIDAD.trim(),
    sistema: aTextoONull(f.TIPO_SISTEMA),
    proceso: aRefNombre(f.COD_PROCESO_SISTEMA, f.PROCESO_SISTEMA),
    cliente: aRefNombre(f.COD_CLIENTE, f.CLIENTE) ?? { id: f.COD_CLIENTE, nombre: String(f.COD_CLIENTE) },
    contacto: aTextoONull(f.CONTACTO),
    asignadoA: aPersona(f.COD_USUARIO_ASIG, f.USUARIO_ASIG),
    creadoEn: aFechaHoraIso(f.FECHA_CREACION, zona),
    actualizadoEn: aFechaHoraIso(f.FECHA_ULTIMO_CAMBIO, zona),
    pedidoNormalizado: aTextoONull(f.PEDIDO_NORMALIZADO),
  };
}

/**
 * Historial compacto: `evento` solo en hitos de sistema, `resultado` solo en el primer movimiento
 * y cuando cambia, y los campos que no aplican se omiten.
 */
export function mapearHistorial(filas: FilaHistorial[], zona: string): Movimiento[] {
  let resultadoAnterior: string | null = null;
  return filas.map((f, i) => {
    const resultado = f.RESULTADO_RECLAMO?.trim() || null;
    const mostrarResultado = resultado !== null && (i === 0 || resultado !== resultadoAnterior);
    resultadoAnterior = resultado;
    const tipo = f.TIPO_HITO.trim();
    return omitirNulos({
      id: f.COD_MENSAJE_CLIENTE,
      fecha: aFechaHoraIso(f.FECHA_HORA, zona),
      tipo,
      autor: aPersona(f.COD_USUARIO, f.USUARIO) ?? SIN_PERSONA,
      destinatario: aPersona(f.COD_USUARIO_DESTINO, f.USUARIO_DESTINO),
      evento: tipo !== 'MENSAJE' ? htmlATexto(f.TEXTO_HITO) || null : null,
      texto: htmlATexto(f.MENSAJE),
      resultado: mostrarResultado ? resultado : null,
      esDelCliente: aBooleano(f.ES_MENSAJE_CLIENTE),
      visibleCliente: aBooleano(f.VISIBLE_CLIENTE),
      adjuntos: f.ADJUNTOS ?? 0,
      respondeA: f.COD_MENSAJE_RESPUESTA,
    }) as Movimiento;
  });
}

function mapearAgenda(f: FilaAgenda, zona: string): Agenda {
  return {
    id: f.COD_EVENTO,
    inicio: aFechaHoraIso(f.FECHA_EVENTO, zona),
    fin: aFechaHoraIsoONull(f.FECHA_HASTA, zona),
    todoElDia: aBooleano(f.TODO_DIA),
    realizada: aBooleano(f.REALIZADO),
    usuario: aPersona(f.COD_USUARIO_AGENDA, f.USUARIO_AGENDA) ?? SIN_PERSONA,
  };
}

function mapearPresupuesto(f: FilaPresupuesto, zona: string): Presupuesto {
  return {
    comprobante: f.NRO_COMPROBANTE.trim(),
    fecha: aFecha(f.FECHA),
    estado: f.ESTADO.trim(),
    importe: Number(f.IMPORTE),
    aprobadoEn: aFechaHoraIsoONull(f.FECHA_HORA_APROBO, zona),
  };
}

/** Último segmento de una ruta o URL ('/' o '\'). */
function nombreDeRuta(ruta: string): string {
  return ruta.split(/[\\/]/).filter(Boolean).pop() ?? ruta;
}

export function mapearAdjunto(f: FilaAdjunto): Adjunto {
  return {
    id: f.COD_ARCHIVO,
    nombre: aTextoONull(f.OBSERVACION) ?? nombreDeRuta(aTextoONull(f.RUTA_REAL) ?? f.RUTA),
    url: f.RUTA.trim(),
    mensajeId: f.COD_MENSAJE_CLIENTE,
    fecha: aFecha(f.FECHA),
  };
}

export function resumirContexto(c: ContextoTicket): string {
  const t = c.ticket;
  const asignado = t.asignadoA ? `asignado a ${t.asignadoA.nombre}` : 'sin asignar';
  const movimientos =
    c.historial.length < c.totalHistorial
      ? `${plural(c.totalHistorial, 'movimiento')} (se muestran los últimos ${c.historial.length})`
      : plural(c.totalHistorial, 'movimiento');
  return (
    `Ticket #${t.id} "${t.titulo}" — ${t.estado}, prioridad ${t.prioridad}, ${asignado}. ` +
    `${movimientos}, ${plural(c.tareas.length, 'tarea')}, ${plural(c.agendas.length, 'agenda')}, ` +
    `${plural(c.presupuestos.length, 'presupuesto')}, ${plural(c.adjuntos.length, 'adjunto')}.`
  );
}

// ---------------------------------------------------------------- definición

const PERSONA = ref('persona');

export function crearObtenerContextoTicket({ acceso, zonaHoraria }: DependenciasTools): DefinicionTool<Entrada, ContextoTicket> {
  return {
    nombre: 'obtener_contexto_ticket',
    titulo: 'Contexto completo de un ticket',
    descripcion:
      'Devuelve en una sola llamada todo el contexto de un ticket de JKMate: detalle, historial compacto ' +
      '(mensajes e hitos de sistema, del más viejo al más nuevo), tareas de desarrollo, agendas, ' +
      'presupuestos y lista de adjuntos (solo metadatos y URL). Usala para entender un ticket antes de ' +
      'responder o trabajar en él; no hace falta llamar a otras tools para lo mismo.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: { type: 'integer', minimum: 1, description: 'Número de ticket' },
        soloVisibleCliente: {
          type: 'boolean',
          default: false,
          description: 'true = oculta del historial las notas internas que el cliente no ve',
        },
        limiteHistorial: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
          default: 50,
          description: 'Cantidad máxima de movimientos; si hay más, se devuelven los más recientes',
        },
      },
      required: ['ticketId'],
      additionalProperties: false,
    },
    outputSchema: conDefs({
      type: 'object',
      properties: {
        ticket: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            titulo: { type: 'string' },
            estado: ref('estadoTicket'),
            resultado: { type: 'string', description: 'Subestado actual (resultado del último movimiento)' },
            prioridad: ref('prioridadTicket'),
            sistema: ref('sistema'),
            proceso: refNullable('refNombre'),
            cliente: ref('refNombre'),
            contacto: { type: ['string', 'null'] },
            asignadoA: refNullable('persona'),
            creadoEn: ref('fechaHora'),
            actualizadoEn: ref('fechaHora'),
            pedidoNormalizado: { type: ['string', 'null'] },
          },
          required: [
            'id',
            'titulo',
            'estado',
            'resultado',
            'prioridad',
            'sistema',
            'proceso',
            'cliente',
            'contacto',
            'asignadoA',
            'creadoEn',
            'actualizadoEn',
            'pedidoNormalizado',
          ],
        },
        totalHistorial: { type: 'integer' },
        historial: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              fecha: ref('fechaHora'),
              tipo: { enum: [...TIPOS_HITO] },
              autor: PERSONA,
              destinatario: PERSONA,
              evento: { type: 'string', description: 'Qué hizo el sistema. Solo si tipo != MENSAJE' },
              texto: { type: 'string', description: 'Texto del mensaje, sin HTML' },
              resultado: { type: 'string', description: 'Solo en el primer movimiento y cuando cambia respecto del anterior' },
              esDelCliente: { type: 'boolean' },
              visibleCliente: { type: 'boolean' },
              adjuntos: { type: 'integer' },
              respondeA: { type: 'integer' },
            },
            required: ['id', 'fecha', 'tipo', 'autor', 'texto', 'esDelCliente', 'visibleCliente', 'adjuntos'],
          },
        },
        tareas: { type: 'array', items: ref('tarea') },
        agendas: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              inicio: ref('fechaHora'),
              fin: refNullable('fechaHora'),
              todoElDia: { type: 'boolean' },
              realizada: { type: 'boolean' },
              usuario: PERSONA,
            },
            required: ['id', 'inicio', 'fin', 'todoElDia', 'realizada', 'usuario'],
          },
        },
        presupuestos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              comprobante: { type: 'string' },
              fecha: ref('fecha'),
              estado: ref('estadoPresupuesto'),
              importe: { type: 'number' },
              aprobadoEn: refNullable('fechaHora'),
            },
            required: ['comprobante', 'fecha', 'estado', 'importe', 'aprobadoEn'],
          },
        },
        adjuntos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              nombre: { type: 'string' },
              url: { type: 'string', format: 'uri' },
              mensajeId: { type: 'integer' },
              fecha: ref('fecha'),
            },
            required: ['id', 'nombre', 'url', 'mensajeId', 'fecha'],
          },
        },
      },
      required: ['ticket', 'totalHistorial', 'historial', 'tareas', 'agendas', 'presupuestos', 'adjuntos'],
    }),
    annotations: ANOTACIONES_LECTURA,
    entrada,

    async ejecutar(args, ctx) {
      const id = args.ticketId;
      const [ticket, historial, tareas, agendas, presupuestos, adjuntos] = await acceso.enTransaccion(
        (sp) =>
          Promise.all([
            obtenerTicket(sp, id),
            listarHistorial(sp, { codReclamo: id, soloVisibleCliente: args.soloVisibleCliente, limite: args.limiteHistorial }),
            listarTareas(sp, { codReclamo: id, soloPendientes: false, limite: LIMITE_TAREAS, desplazamiento: 0 }),
            listarAgendasTicket(sp, id),
            listarPresupuestosTicket(sp, id),
            listarAdjuntosTicket(sp, id),
          ]),
        ctx.medidor,
      );
      if (!ticket) throw new ErrorTool('TICKET_NO_ENCONTRADO', `El ticket ${id} no existe`);

      const datos: ContextoTicket = {
        ticket: mapearTicket(ticket, zonaHoraria),
        totalHistorial: historial[0]?.TOTAL ?? 0,
        historial: mapearHistorial(historial, zonaHoraria),
        tareas: tareas.map((t) => mapearTarea(t, zonaHoraria, true)),
        agendas: agendas.map((a) => mapearAgenda(a, zonaHoraria)),
        presupuestos: presupuestos.map((p) => mapearPresupuesto(p, zonaHoraria)),
        adjuntos: adjuntos.map(mapearAdjunto),
      };
      return { datos, resumen: resumirContexto(datos) };
    },
  };
}

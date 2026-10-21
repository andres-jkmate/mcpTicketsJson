import { describe, expect, it } from 'vitest';
import { accesoSimulado, conectarCliente, r } from '../../test/apoyo.js';
import {
  HISTORIAL_74836,
  PRESUPUESTO_74619,
  spsContexto,
  tareaSimulada,
  TICKET_74836,
  type OpcionesTicket,
} from '../../test/datos/ticket-74836.js';
import type { Fila } from '../db/firebird.js';
import { crearObtenerContextoTicket, type ContextoTicket } from './obtener-contexto-ticket.js';

const ZONA = 'America/Argentina/Buenos_Aires';

async function contexto(args: Record<string, unknown>, datos: OpcionesTicket = {}) {
  const { acceso, llamadas } = accesoSimulado(spsContexto(datos));
  const { cliente, eventos } = await conectarCliente([crearObtenerContextoTicket({ acceso, zonaHoraria: ZONA })]);
  await cliente.listTools(); // el cliente valida structuredContent contra el outputSchema publicado
  const resultado = await cliente.callTool({ name: 'obtener_contexto_ticket', arguments: args });
  return { resultado, datos: resultado.structuredContent as unknown as ContextoTicket, llamadas, eventos };
}

describe('obtener_contexto_ticket', () => {
  describe('contexto completo en una llamada', () => {
    it('ticket #74836', async () => {
      const { resultado, datos, eventos } = await contexto({ ticketId: 74836 });
      expect(resultado.isError).toBeFalsy();
      expect(datos.ticket.id).toBe(74836);
      expect(datos.ticket.estado).toBe('AGENDADO');
      expect(datos.ticket.prioridad).toBe('CRITICA');
      expect(datos.historial.map((h) => h.id)).toEqual([17141, 17303, 17310, 17311, 17697]);
      expect(datos.agendas).toHaveLength(1);
      expect(datos.presupuestos).toEqual([]);
      expect(eventos.find((e) => e.evento === 'invocacion_tool')).toMatchObject({ llamadasBase: 6 });
    });

    it('ticket sin tareas: arreglo vacío, no error', async () => {
      const { resultado, datos } = await contexto({ ticketId: 74836 });
      expect(resultado.isError).toBeFalsy();
      expect(datos.tareas).toEqual([]);
    });

    it('las tareas del ticket traen la forma de listar_tareas más la descripción', async () => {
      const { datos, llamadas } = await contexto({ ticketId: 74703 }, { tareas: [tareaSimulada()] });
      expect(datos.tareas).toEqual([
        {
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
          descripcion: 'Detalle largo de la tarea',
        },
      ]);
      // todas las tareas del ticket, no solo las pendientes
      expect(llamadas.find((l) => l.nombre === 'PROC_LIST_TAREAS_AG')?.parametros).toEqual([
        null, null, 74703, null, 0, null, null, null, 0, 100, 0,
      ]);
    });
  });

  describe('detalle del ticket', () => {
    it('datos del detalle', async () => {
      const { datos } = await contexto({ ticketId: 74836 });
      expect(datos.ticket).toEqual({
        id: 74836,
        titulo: 'error al cargar asiento',
        estado: 'AGENDADO',
        resultado: 'AGENDADO',
        prioridad: 'CRITICA',
        sistema: 'JK3',
        proceso: { id: 488, nombre: 'Ingreso de Asientos' },
        cliente: { id: 502312, nombre: 'Suscripciones del Cielo SA' },
        contacto: 'julieta marchan',
        asignadoA: { id: 15169, nombre: 'Andres Pelaez' },
        creadoEn: '2026-09-28T15:44:11.925-03:00',
        actualizadoEn: '2026-10-05T13:09:35.383-03:00',
        pedidoNormalizado: null,
      });
      expect(datos.ticket).not.toHaveProperty('tipo');
    });

    it('subestado distinto del estado', async () => {
      const { datos } = await contexto(
        { ticketId: 74111 },
        { ticket: { ...TICKET_74836, COD_RECLAMO: 74111, ESTADO: 'PENDIENTE', RESULTADO_RECLAMO: 'PRESUPUESTO PENDIENTE APROBACIÓN' } },
      );
      expect(datos.ticket.estado).toBe('PENDIENTE');
      expect(datos.ticket.resultado).toBe('PRESUPUESTO PENDIENTE APROBACIÓN');
    });
  });

  describe('historial compacto', () => {
    it('mensaje de cliente compacto', async () => {
      const { datos } = await contexto({ ticketId: 74836 });
      expect(datos.historial[0]).toEqual({
        id: 17141,
        fecha: '2026-09-28T15:44:11.925-03:00',
        tipo: 'MENSAJE',
        autor: { id: 15246, nombre: 'SANTOS LARA' },
        texto: 'Titulo: error al cargar asiento\nno puedo cargar e3l asiento por un error adjujnto imagen',
        resultado: 'INICIADO',
        esDelCliente: true,
        visibleCliente: true,
        adjuntos: 0,
      });
    });

    it('hito de sistema con evento y texto', async () => {
      const { datos } = await contexto({ ticketId: 74836 });
      expect(datos.historial[2]).toMatchObject({
        tipo: 'ASIGNACION',
        evento: 'Ticket asignado a ANDRES JKMT',
        texto: 'Prioridad cambiada a CRITICA',
        destinatario: { id: 15169, nombre: 'Andres Pelaez' },
      });
    });

    it('resultado solo cuando cambia', async () => {
      const { datos } = await contexto({ ticketId: 74836 });
      expect(datos.historial.map((h) => h.resultado)).toEqual(['INICIADO', undefined, undefined, undefined, 'AGENDADO']);
    });

    it('mensaje con HTML', async () => {
      const historial = [{ ...HISTORIAL_74836[0]!, MENSAJE: '<p>Necesitamos una alerta</p>' }];
      const { datos } = await contexto({ ticketId: 74836 }, { historial });
      expect(datos.historial[0]?.texto).toBe('Necesitamos una alerta');
    });

    it('solo lo visible para el cliente', async () => {
      const historial: Fila[] = [...HISTORIAL_74836, { ...HISTORIAL_74836[3]!, COD_MENSAJE_CLIENTE: 18000, VISIBLE_CLIENTE: 0 }];
      const { datos, llamadas } = await contexto({ ticketId: 74836, soloVisibleCliente: true }, { historial });
      expect(llamadas.find((l) => l.nombre === 'PROC_LIST_HIST_TICKET_AG')?.parametros).toEqual([74836, 1, 50]);
      expect(datos.historial.every((h) => h.visibleCliente)).toBe(true);
      expect(datos.historial).toHaveLength(5);
    });

    it('incluye CAMBIO_PRIORIDAD y CAMBIO_TIPO_SISTEMA', async () => {
      const historial = [
        { ...HISTORIAL_74836[3]!, TIPO_HITO: 'CAMBIO_PRIORIDAD', MENSAJE: 'Prioridad cambiada a ALTA', TEXTO_HITO: 'Prioridad cambiada a ALTA' },
        { ...HISTORIAL_74836[3]!, COD_MENSAJE_CLIENTE: 2, TIPO_HITO: 'CAMBIO_TIPO_SISTEMA', MENSAJE: 'Tipo de sistema cambiado a JK3', TEXTO_HITO: 'Tipo de sistema cambiado a JK3' },
      ];
      const { resultado, datos } = await contexto({ ticketId: 74836 }, { historial });
      expect(resultado.isError).toBeFalsy();
      expect(datos.historial.map((h) => [h.tipo, h.evento])).toEqual([
        ['CAMBIO_PRIORIDAD', 'Prioridad cambiada a ALTA'],
        ['CAMBIO_TIPO_SISTEMA', 'Tipo de sistema cambiado a JK3'],
      ]);
    });
  });

  describe('límite del historial', () => {
    it('historial largo: los 50 más recientes en orden ascendente y el total', async () => {
      const historial: Fila[] = Array.from({ length: 120 }, (_, i) => ({
        ...HISTORIAL_74836[1]!,
        COD_MENSAJE_CLIENTE: 20000 + i,
        FECHA_HORA: new Date(r('2026-10-01 00:00:00').getTime() + i * 60_000),
      }));
      const { datos, resultado } = await contexto({ ticketId: 74836 }, { historial });
      expect(datos.totalHistorial).toBe(120);
      expect(datos.historial).toHaveLength(50);
      expect(datos.historial[0]?.id).toBe(20070);
      expect(datos.historial[49]?.id).toBe(20119);
      expect((resultado.content as { text: string }[])[0]?.text).toContain('120 movimientos (se muestran los últimos 50)');
    });

    it('rechaza un límite mayor a 200', async () => {
      const { resultado } = await contexto({ ticketId: 74836, limiteHistorial: 500 });
      expect(resultado.structuredContent).toMatchObject({ error: { codigo: 'PARAMETRO_INVALIDO' } });
    });
  });

  describe('tareas, agendas, presupuestos y adjuntos', () => {
    it('adjuntos solo como lista, con el nombre de la ruta si no tiene uno registrado', async () => {
      const { datos } = await contexto({ ticketId: 74836 });
      expect(datos.adjuntos).toEqual([
        {
          id: 6168,
          nombre: '78B92411E06CEEF0AD2D773CFAF867E8.png',
          url: 'https://ticket.jakemate.net:19089/api/Files/attachments/ticket/78B92411E06CEEF0AD2D773CFAF867E8.png',
          mensajeId: 17303,
          fecha: '2026-09-30',
        },
        {
          id: 6169,
          nombre: '3EF72423FB95A481914EF9887CA29A52.png',
          url: 'https://ticket.jakemate.net:19089/api/Files/attachments/ticket/3EF72423FB95A481914EF9887CA29A52.png',
          mensajeId: 17303,
          fecha: '2026-09-30',
        },
      ]);
    });

    it('agenda sin datos repetidos', async () => {
      const { datos } = await contexto({ ticketId: 74836 });
      expect(datos.agendas).toEqual([
        {
          id: 156,
          inicio: '2026-10-06T09:00:00-03:00',
          fin: '2026-10-06T09:50:00-03:00',
          todoElDia: false,
          realizada: false,
          usuario: { id: 15169, nombre: 'Andres Pelaez' },
        },
      ]);
    });

    it('agenda sin fecha de fin', async () => {
      const { datos, resultado } = await contexto({ ticketId: 74836 }, { agendas: [{ ...spsContexto().PROC_LIST_AGENDAS_TICKET_AG!([])[0], FECHA_HASTA: null }] });
      expect(resultado.isError).toBeFalsy();
      expect(datos.agendas[0]?.fin).toBeNull();
    });

    it('importe numérico', async () => {
      const { datos } = await contexto({ ticketId: 74619 }, { presupuestos: [PRESUPUESTO_74619] });
      expect(datos.presupuestos).toEqual([
        { comprobante: 'P-0001-00000088', fecha: '2026-10-05', estado: 'APROBADO', importe: 121, aprobadoEn: '2026-10-07T09:35:22.378-03:00' },
      ]);
    });
  });

  describe('visibilidad', () => {
    it('ticket asignado a otro usuario: contexto completo sin error', async () => {
      const { resultado, datos } = await contexto(
        { ticketId: 74836 },
        { ticket: { ...TICKET_74836, COD_USUARIO_ASIG: 999, USUARIO_ASIG: 'Otra Persona' } },
      );
      expect(resultado.isError).toBeFalsy();
      expect(datos.ticket.asignadoA).toEqual({ id: 999, nombre: 'Otra Persona' });
    });
  });

  describe('errores y contrato', () => {
    it('ticket inexistente → TICKET_NO_ENCONTRADO', async () => {
      const { resultado } = await contexto({ ticketId: 1 }, { ticket: null });
      expect(resultado.isError).toBe(true);
      expect(resultado.structuredContent).toEqual({ error: { codigo: 'TICKET_NO_ENCONTRADO', mensaje: 'El ticket 1 no existe' } });
    });

    it('sin columnas crudas ni datos de UI, una sola fecha por movimiento', async () => {
      const { datos } = await contexto({ ticketId: 74836 });
      const json = JSON.stringify(datos);
      expect(json).not.toMatch(/"[A-Z]+_[A-Z_]+":/);
      expect(json).not.toMatch(/color/i);
      for (const h of datos.historial) {
        expect(Object.keys(h).filter((k) => /fecha/i.test(k))).toEqual(['fecha']);
      }
    });

    it('el resumen incluye número, título, estado y asignado', async () => {
      const { resultado } = await contexto({ ticketId: 74836 });
      expect((resultado.content as { text: string }[])[0]?.text).toBe(
        'Ticket #74836 "error al cargar asiento" — AGENDADO, prioridad CRITICA, asignado a Andres Pelaez. ' +
          '5 movimientos, 0 tareas, 1 agenda, 0 presupuestos, 2 adjuntos.',
      );
    });

    it('el cliente del SDK valida de verdad contra el outputSchema (un estado fuera del enum falla)', async () => {
      await expect(contexto({ ticketId: 74836 }, { ticket: { ...TICKET_74836, ESTADO: 'ESTADO NUEVO' } })).rejects.toThrow(
        /output schema/i,
      );
    });

    it('mismo usuario, mismo nombre en asignado y agenda', async () => {
      const { datos } = await contexto({ ticketId: 74836 });
      expect(datos.agendas[0]?.usuario).toEqual(datos.ticket.asignadoA);
    });
  });
});

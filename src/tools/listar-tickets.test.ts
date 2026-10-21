import { describe, expect, it } from 'vitest';
import { accesoSimulado, conectarCliente } from '../../test/apoyo.js';
import { listarTicketsSimulado, TICKETS, type TicketSimulado } from '../../test/datos/tickets-simulados.js';
import { crearListarTickets, type ListadoTickets } from './listar-tickets.js';

const ZONA = 'America/Argentina/Buenos_Aires';

async function listar(args: Record<string, unknown>, tickets: TicketSimulado[] = TICKETS) {
  const { acceso, llamadas } = accesoSimulado({ PROC_LIST_TICKETS_AG: listarTicketsSimulado(tickets) });
  const { cliente, eventos } = await conectarCliente([crearListarTickets({ acceso, zonaHoraria: ZONA })]);
  await cliente.listTools();
  const resultado = await cliente.callTool({ name: 'listar_tickets', arguments: args });
  const texto = (resultado.content as { text: string }[])[0]?.text ?? '';
  return { resultado, datos: resultado.structuredContent as unknown as ListadoTickets, llamadas, eventos, texto };
}

const codigoError = (r: unknown) => (r as { structuredContent?: { error?: { codigo: string } } }).structuredContent?.error?.codigo;

describe('listar_tickets', () => {
  describe('listado liviano', () => {
    it('elemento liviano, ordenado por actualización descendente', async () => {
      const { datos } = await listar({});
      expect(datos.tickets.map((t) => t.id)).toEqual([74111, 74836, 74790, 74500]);
      const json = JSON.stringify(datos);
      expect(json).not.toContain('pedidoNormalizado');
      expect(json).not.toContain('Necesitan una alerta');
      expect(json).not.toContain('adjunto una imagen');
    });

    it('agenda y presupuesto sin otra llamada', async () => {
      const { datos } = await listar({});
      const t = datos.tickets.find((x) => x.id === 74836);
      expect(t).toEqual({
        id: 74836,
        titulo: 'error al cargar asiento',
        estado: 'AGENDADO',
        prioridad: 'CRITICA',
        sistema: 'JK3',
        cliente: { id: 502312, nombre: 'Suscripciones del Cielo SA' },
        asignadoA: { id: 15169, nombre: 'Andres Pelaez' },
        creadoEn: '2026-09-28T15:44:11.925-03:00',
        actualizadoEn: '2026-10-05T13:09:35.383-03:00',
        proximaAgenda: { inicio: '2026-10-06T09:00:00-03:00', usuario: { id: 15169, nombre: 'Andres Pelaez' } },
        presupuesto: null,
      });
      expect(datos.tickets.find((x) => x.id === 74790)?.presupuesto).toBe('PENDIENTE');
    });

    it('orden por creación y por agenda', async () => {
      expect((await listar({ orden: 'creacion' })).datos.tickets.map((t) => t.id)).toEqual([74836, 74790, 74500, 74111]);
      expect((await listar({ orden: 'agenda' })).datos.tickets.map((t) => t.id)).toEqual([74836, 74500, 74790, 74111]);
    });

    it('resumen en texto', async () => {
      const { texto } = await listar({ asignadoA: 'yo', estados: ['AGENDADO'], limite: 1 });
      expect(texto).toBe('2 tickets (mostrando 1–1). #74836 AGENDADO/CRITICA "error al cargar asiento".');
    });
  });

  describe('filtros combinables', () => {
    it('solo abiertos por defecto', async () => {
      const { datos, llamadas } = await listar({});
      expect(datos.tickets.some((t) => t.estado === 'FINALIZADO' || t.estado === 'CANCELADO')).toBe(false);
      expect(llamadas[0]?.parametros[1]).toBe(1);
    });

    it('incluir cerrados', async () => {
      const { datos } = await listar({ soloAbiertos: false });
      expect(datos.tickets.map((t) => t.estado)).toEqual(expect.arrayContaining(['FINALIZADO', 'CANCELADO']));
      expect(datos.total).toBe(6);
    });

    it('estados explícitos ignoran soloAbiertos', async () => {
      const { datos } = await listar({ estados: ['FINALIZADO'] });
      expect(datos.tickets.map((t) => t.estado)).toEqual(['FINALIZADO']);
    });

    it('agendados a mí: "yo" se resuelve con la sesión', async () => {
      const { datos, llamadas } = await listar({ agendadoA: 'yo' });
      expect(llamadas[0]?.parametros[5]).toBe(15169);
      expect(datos.tickets.length).toBeGreaterThan(0);
      expect(datos.tickets.every((t) => t.proximaAgenda?.usuario.id === 15169)).toBe(true);
    });

    it('varios estados a la vez', async () => {
      const { datos, llamadas } = await listar({ estados: ['INICIADO', 'AGENDADO'] });
      expect(llamadas[0]?.parametros[0]).toBe('INICIADO,AGENDADO');
      expect(datos.tickets.every((t) => ['INICIADO', 'AGENDADO'].includes(t.estado))).toBe(true);
      expect(datos.total).toBe(3);
    });

    it('mis tickets en un rango de fechas', async () => {
      const { datos } = await listar({ asignadoA: 'yo', creadoDesde: '2026-09-01', creadoHasta: '2026-09-30' });
      expect(datos.tickets.map((t) => t.id)).toContain(74836);
      for (const t of datos.tickets) {
        expect(t.asignadoA?.id).toBe(15169);
        expect(t.creadoEn.startsWith('2026-09')).toBe(true);
      }
    });

    it('prioridades, sistema y cliente', async () => {
      expect((await listar({ prioridades: ['CRITICA', 'ALTA'] })).datos.total).toBe(2);
      expect((await listar({ sistema: 'JK2' })).datos.tickets.map((t) => t.id)).toEqual([74500]);
      expect((await listar({ clienteId: 501877 })).datos.total).toBe(2);
    });

    it('rango de fechas invertido → PARAMETRO_INVALIDO', async () => {
      const { resultado, llamadas } = await listar({ creadoDesde: '2026-10-01', creadoHasta: '2026-09-01' });
      expect(codigoError(resultado)).toBe('PARAMETRO_INVALIDO');
      expect(llamadas).toHaveLength(0);
    });

    it('estado inexistente → PARAMETRO_INVALIDO', async () => {
      expect(codigoError((await listar({ estados: ['NO_EXISTE'] })).resultado)).toBe('PARAMETRO_INVALIDO');
      expect(codigoError((await listar({ prioridades: ['ALTISIMA'] })).resultado)).toBe('PARAMETRO_INVALIDO');
    });

    it('estado válido sin tickets', async () => {
      const { resultado, datos } = await listar({ estados: ['A PRESUPUESTAR'] });
      expect(resultado.isError).toBeFalsy();
      expect(datos.tickets).toEqual([]);
      expect(datos.total).toBe(0);
      expect(datos.hayMas).toBe(false);
    });

    it('no acepta parámetros de identidad ni desconocidos', async () => {
      expect(codigoError((await listar({ codUsuario: 15169 })).resultado)).toBe('PARAMETRO_INVALIDO');
    });
  });

  describe('búsqueda por texto libre', () => {
    it('búsqueda en título', async () => {
      expect((await listar({ texto: 'asiento' })).datos.tickets.map((t) => t.id)).toEqual([74836]);
    });

    it('sin distinguir mayúsculas ni acentos, también en el pedido normalizado', async () => {
      expect((await listar({ texto: 'CONFIGURACION' })).datos.tickets.map((t) => t.id)).toEqual([74111]);
      expect((await listar({ texto: 'alerta' })).datos.tickets.map((t) => t.id)).toEqual([74111]);
    });

    it('búsqueda en mensajes solo con buscarEnMensajes', async () => {
      expect((await listar({ texto: 'imagen' })).datos.tickets).toEqual([]);
      const { datos, llamadas } = await listar({ texto: 'imagen', buscarEnMensajes: true });
      expect(datos.tickets.map((t) => t.id)).toEqual([74836, 74500]);
      expect(llamadas[0]?.parametros[10]).toBe(1);
    });

    it('texto demasiado corto → PARAMETRO_INVALIDO', async () => {
      expect(codigoError((await listar({ texto: 'as' })).resultado)).toBe('PARAMETRO_INVALIDO');
      expect(codigoError((await listar({ texto: '  as  ' })).resultado)).toBe('PARAMETRO_INVALIDO');
    });
  });

  describe('paginación con total', () => {
    const muchos: TicketSimulado[] = Array.from({ length: 45 }, (_, i) => ({
      ...TICKETS[0]!,
      id: 80000 + i,
      actualizado: `2026-10-01 ${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00`,
    }));

    it('segunda página', async () => {
      const { datos } = await listar({ limite: 20, desplazamiento: 20 }, muchos);
      expect(datos.tickets).toHaveLength(20);
      expect(datos).toMatchObject({ total: 45, limite: 20, desplazamiento: 20, hayMas: true });
    });

    it('última página', async () => {
      const { datos } = await listar({ limite: 20, desplazamiento: 40 }, muchos);
      expect(datos.tickets).toHaveLength(5);
      expect(datos.hayMas).toBe(false);
    });

    it('desplazamiento mayor al total: lista vacía pero informa el total', async () => {
      const { datos, llamadas, texto } = await listar({ limite: 20, desplazamiento: 100 }, muchos);
      expect(datos).toMatchObject({ total: 45, hayMas: false, tickets: [] });
      expect(llamadas).toHaveLength(2);
      expect(llamadas[1]?.parametros.slice(-2)).toEqual([1, 0]);
      expect(texto).toBe('45 tickets abiertos (ninguno en esta página).');
    });

    it('límite fuera de rango → PARAMETRO_INVALIDO', async () => {
      const { resultado, llamadas } = await listar({ limite: 500 });
      expect(codigoError(resultado)).toBe('PARAMETRO_INVALIDO');
      expect(llamadas).toHaveLength(0);
    });

    it('defaults: límite 20 y desplazamiento 0', async () => {
      const { datos } = await listar({}, muchos);
      expect(datos).toMatchObject({ limite: 20, desplazamiento: 0, total: 45, hayMas: true });
    });
  });
});

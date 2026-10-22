import { beforeAll, describe, expect, it } from 'vitest';
import { leerJson } from './configuracion.js';
import { cargarEscrituraV2, Validador, type ToolEscrituraV2 } from './validacion.js';

let crearTarea: ToolEscrituraV2;
let actualizarTicket: ToolEscrituraV2;
const validador = new Validador();

beforeAll(async () => {
  const tools = cargarEscrituraV2(await leerJson('escritura-v2.json'));
  crearTarea = tools.find((t) => t.name === 'crear_tarea')!;
  actualizarTicket = tools.find((t) => t.name === 'actualizar_ticket')!;
});

const tareaValida = () => ({
  tarea: { nombre: 'Agregar filtro por fecha' },
  asignacion: { desarrollador: { nombre: 'Juan Pérez' }, responsable: 'yo' },
  planificacion: { horasEstimadas: 4, fechaCompromiso: '2026-10-30' },
  ticketId: 74836,
  descripcion: {
    pedido: 'El cliente necesita filtrar por fecha',
    criteriosAceptacion: ['El listado filtra por fecha desde y hasta'],
    objetosAfectados: [{ tipo: 'formulario', nombre: 'FRM_TICKETS', accion: 'modificar' }],
  },
});

describe('escritura-v2.json', () => {
  it('define crear_tarea y actualizar_ticket', () => {
    expect(crearTarea).toBeDefined();
    expect(actualizarTicket).toBeDefined();
  });

  it('crear_tarea acepta un ejemplo válido', () => {
    expect(validador.validar(crearTarea.input_schema, tareaValida())).toEqual({ valido: true, errores: [] });
  });

  it('crear_tarea rechaza la falta de descripcion.criteriosAceptacion y nombra el campo', () => {
    const args = tareaValida() as { descripcion: Record<string, unknown> };
    delete args.descripcion.criteriosAceptacion;
    const r = validador.validar(crearTarea.input_schema, args);
    expect(r.valido).toBe(false);
    expect(r.errores.map((e) => e.campo)).toContain('descripcion.criteriosAceptacion');
  });

  it('crear_tarea rechaza un personaRef con id y nombre juntos', () => {
    const args = { ...tareaValida(), asignacion: { desarrollador: { id: 100936, nombre: 'Juan Pérez' } } };
    expect(validador.validar(crearTarea.input_schema, args).valido).toBe(false);
  });

  it('crear_tarea rechaza una fecha de compromiso que no es fecha', () => {
    const args = { ...tareaValida(), planificacion: { fechaCompromiso: 'mañana' } };
    expect(validador.validar(crearTarea.input_schema, args).valido).toBe(false);
  });

  it('actualizar_ticket acepta cambios + mensaje', () => {
    const args = { ticketId: 74836, cambios: { prioridad: 'ALTA' }, mensaje: { texto: 'Se sube la prioridad' } };
    expect(validador.validar(actualizarTicket.input_schema, args).valido).toBe(true);
  });

  it('actualizar_ticket rechaza la falta de cambios y de mensaje', () => {
    expect(validador.validar(actualizarTicket.input_schema, { ticketId: 74836 }).valido).toBe(false);
  });

  it('actualizar_ticket rechaza una prioridad fuera del enum', () => {
    expect(validador.validar(actualizarTicket.input_schema, { ticketId: 1, cambios: { prioridad: 'alta' } }).valido).toBe(false);
  });
});

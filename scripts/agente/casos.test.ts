import { describe, expect, it } from 'vitest';
import { cargarCasos } from './casos.js';

const criterio = 'criterio';
const casosCompletos = () => [
  { id: 'estado-ticket', tipo: 'lectura', ticketId: 74836, pedido: '¿Cómo está el 74836?', criterio },
  { id: 'mis-tickets-agendados', tipo: 'lectura', pedido: '¿Qué tickets tengo agendados?', criterio },
  { id: 'mis-tareas-pendientes', tipo: 'lectura', pedido: '¿Qué tareas tengo pendientes?', criterio },
  { id: 'crear-tarea', tipo: 'escritura', ticketId: 74836, desarrollador: { id: 1, nombre: 'Ana' }, pedido: 'Creale una tarea a Ana', criterio },
  { id: 'prioridad-mensaje', tipo: 'escritura', ticketId: 74000, prioridad: 'ALTA', pedido: 'Subí la prioridad', criterio },
];

describe('casos.json', () => {
  it('un conjunto completo carga con 5 repeticiones y 25 turnos por defecto', () => {
    const c = cargarCasos({ casos: casosCompletos() });
    expect(c.repeticiones).toBe(5);
    expect(c.maxTurnos).toBe(25);
    expect(c.casos).toHaveLength(5);
  });

  it.each(['estado-ticket', 'mis-tickets-agendados', 'mis-tareas-pendientes', 'crear-tarea', 'prioridad-mensaje'])(
    'falla si falta el caso obligatorio %s',
    (id) => {
      expect(() => cargarCasos({ casos: casosCompletos().filter((c) => c.id !== id) })).toThrow(new RegExp(`Faltan casos obligatorios: ${id}`));
    },
  );

  it('rechaza casos repetidos, un tipo equivocado y un caso 4 sin desarrollador', () => {
    expect(() => cargarCasos({ casos: [...casosCompletos(), casosCompletos()[0]] })).toThrow(/repetidos/);
    expect(() => cargarCasos({ casos: casosCompletos().map((c) => (c.id === 'crear-tarea' ? { ...c, tipo: 'lectura' } : c)) })).toThrow();
    expect(() => cargarCasos({ casos: casosCompletos().map((c) => (c.id === 'crear-tarea' ? { ...c, desarrollador: undefined } : c)) })).toThrow();
  });
});

describe('casos.json versionado', () => {
  it('pasa la validación', async () => {
    const { leerJson } = await import('./configuracion.js');
    const c = cargarCasos(await leerJson('casos.json'));
    expect(c.casos.map((x) => x.id)).toHaveLength(5);
  });
});

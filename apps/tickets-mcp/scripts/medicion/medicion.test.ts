import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { medirResultado } from '../agente/conexion.js';
import { cargarConjunto } from './conjunto.js';
import { fechaCreacionV1, medirContexto, medirListado, type Llamador, type RespuestaMedida } from './estrategias.js';
import { aMarkdown, armarReporte, reduccion } from './reporte.js';

const TEXTO_TICKET = 'no puedo cargar e3l asiento por un error adjujnto imagen';
const TOKEN = 'eyJ.token.secreto';

const respuesta = (texto: string, estructurado?: unknown, esError = false): RespuestaMedida =>
  medirResultado({ content: [{ type: 'text', text: texto }], structuredContent: estructurado, isError: esError });

/** Llamador simulado: responde según la tool y registra las invocaciones. */
function llamadorSimulado(respuestas: Record<string, (args: Record<string, unknown>) => RespuestaMedida>) {
  const invocaciones: { tool: string; argumentos: Record<string, unknown> }[] = [];
  const llamar: Llamador = async (tool, argumentos) => {
    invocaciones.push({ tool, argumentos });
    const r = respuestas[tool];
    if (!r) throw new Error(`tool no simulada: ${tool}`);
    return r(argumentos);
  };
  return { llamar, invocaciones };
}

const v1 = () =>
  llamadorSimulado({
    detalle_ticket: () => respuesta(`[{"ESTADO":"AGENDADO","FECHA_CREACION":"2026-09-28T15:44:11.925","TITULO_TICKET":"x"}]`), // 74
    historial_ticket: () => respuesta('h'.repeat(4300)),
    agendas_ticket: () => respuesta('a'.repeat(480)),
    presupuestos_ticket: () => respuesta('[]'),
    listar_tareas_responsable: () => respuesta(`t${TEXTO_TICKET}`.repeat(10)),
    listar_tickets: () => respuesta('l'.repeat(2000)),
  });

const v2 = () =>
  llamadorSimulado({
    obtener_contexto_ticket: () => respuesta('r'.repeat(150), { ticket: { texto: 'e'.repeat(1350) } }),
    listar_tickets: () => respuesta('r'.repeat(100), { tickets: 'x'.repeat(380) }),
  });

describe('conjunto de medición', () => {
  it('el archivo versionado es válido e incluye el #74836', () => {
    const conjunto = cargarConjunto(JSON.parse(readFileSync('medicion/tickets.json', 'utf8')));
    expect(conjunto.tickets).toContain(74836);
    expect(conjunto.listados.length).toBeGreaterThan(0);
  });

  it('rechaza un conjunto sin el #74836', () => {
    expect(() => cargarConjunto({ tickets: [74111, 74703] })).toThrow(/74836/);
  });

  it('rechaza tickets repetidos o un formato inválido', () => {
    expect(() => cargarConjunto({ tickets: [74836, 74836] })).toThrow(/repetidos/);
    expect(() => cargarConjunto({ tickets: ['74836'] })).toThrow();
  });
});

describe('estrategias', () => {
  it('contexto v1: 5 llamadas, tareas desde la creación del ticket', async () => {
    const a = v1();
    const b = v2();
    const m = await medirContexto(a.llamar, b.llamar, 74836, '2026-10-17');
    expect(a.invocaciones.map((i) => i.tool)).toEqual([
      'detalle_ticket',
      'historial_ticket',
      'agendas_ticket',
      'presupuestos_ticket',
      'listar_tareas_responsable',
    ]);
    expect(a.invocaciones[4]?.argumentos).toEqual({ FECHA_DESDE: '2026-09-28 00:00', FECHA_HASTA: '2026-10-17 23:59' });
    expect(m.v1.llamadas).toBe(5);
    expect(m.v1.caracteresEstructurado).toBeNull();
    expect(m.v2).toMatchObject({ llamadas: 1, caracteresTexto: 150 });
    expect(b.invocaciones).toEqual([{ tool: 'obtener_contexto_ticket', argumentos: { ticketId: 74836 } }]);
  });

  it('extrae la fecha de creación del detalle v1', () => {
    expect(fechaCreacionV1('[{"FECHA_CREACION": "2026-09-28T15:44:11.925"}]')).toBe('2026-09-28');
    expect(fechaCreacionV1('sin fecha')).toBeNull();
  });

  it('listado: una llamada por versión con los argumentos del conjunto', async () => {
    const a = v1();
    const b = v2();
    const caso = {
      nombre: 'mis tickets agendados',
      v1: { tool: 'listar_tickets', argumentos: { P_ESTADO: 'AGENDADO' } },
      v2: { tool: 'listar_tickets', argumentos: { asignadoA: 'yo', estados: ['AGENDADO'] } },
    };
    const m = await medirListado(a.llamar, b.llamar, caso);
    expect(m).toMatchObject({ tipo: 'listado', caso: 'mis tickets agendados', v1: { llamadas: 1, caracteresTexto: 2000 } });
    expect(b.invocaciones[0]?.argumentos).toEqual({ asignadoA: 'yo', estados: ['AGENDADO'] });
  });

  it('cuenta los errores de cada versión', async () => {
    const conError = llamadorSimulado({ obtener_contexto_ticket: () => respuesta('TICKET_NO_ENCONTRADO: x', { error: {} }, true) });
    const m = await medirContexto(v1().llamar, conError.llamar, 74836, '2026-10-17');
    expect(m.v2.errores).toBe(1);
  });
});

describe('reporte', () => {
  it('cálculo de reducciones', () => {
    expect(reduccion(5400, 3000)).toBe(44.4);
    expect(reduccion(1000, 1000)).toBe(0);
    expect(reduccion(1000, 1200)).toBe(-20);
    expect(reduccion(0, 10)).toBeNull();
    expect(reduccion(1000, null)).toBeNull();
  });

  it('arma filas, totales por tipo y total general', async () => {
    const contexto = await medirContexto(v1().llamar, v2().llamar, 74836, '2026-10-17');
    const listado = await medirListado(v1().llamar, v2().llamar, {
      nombre: 'mis tickets agendados',
      v1: { tool: 'listar_tickets', argumentos: {} },
      v2: { tool: 'listar_tickets', argumentos: {} },
    });
    const reporte = armarReporte([contexto, listado], new Date('2026-10-17T22:00:00Z'));
    const fila74836 = reporte.filas.find((f) => f.caso === 'contexto #74836');
    expect(fila74836).toMatchObject({ llamadasV1: 5, llamadasV2: 1 });
    expect(fila74836?.caracteresV1).toBe(contexto.v1.caracteresTexto);
    expect(fila74836?.reduccionTexto).toBe(reduccion(contexto.v1.caracteresTexto, 150));
    expect(reporte.totalesPorTipo.contexto.llamadasV1).toBe(5);
    expect(reporte.totalesPorTipo.listado).toMatchObject({ llamadasV1: 1, caracteresV1: 2000, caracteresTextoV2: 100 });
    expect(reporte.totales).toMatchObject({
      llamadasV1: 6,
      llamadasV2: 2,
      caracteresV1: contexto.v1.caracteresTexto + 2000,
      caracteresTextoV2: 250,
    });
    expect(reporte.totales.caracteresEstructuradoV2).toBe(contexto.v2.caracteresEstructurado! + listado.v2.caracteresEstructurado!);
  });

  it('el reporte no contiene textos de tickets ni tokens', async () => {
    const contexto = await medirContexto(v1().llamar, v2().llamar, 74836, '2026-10-17');
    const reporte = armarReporte([contexto], new Date());
    const salida = JSON.stringify(reporte) + aMarkdown(reporte);
    expect(salida).not.toContain(TEXTO_TICKET);
    expect(salida).not.toContain(TOKEN);
    expect(salida).not.toContain('AGENDADO');
    expect(aMarkdown(reporte)).toContain('| contexto #74836 | 5 | 1 |');
  });
});

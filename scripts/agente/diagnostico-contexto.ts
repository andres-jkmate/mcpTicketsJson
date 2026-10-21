/**
 * Diagnóstico de un solo uso del tamaño del contexto de un ticket en v1 y v2 (design D11).
 *
 * Para cada ticket de medicion/tickets.json:
 *   v2: desglosa el structuredContent de obtener_contexto_ticket por sección, con la cantidad de
 *       elementos y los caracteres de los textos largos (historial[].texto, tareas[].descripcion).
 *   v1: caracteres y filas de cada una de las 5 llamadas de la estrategia de medicion-eficiencia.
 *
 * Al final compara el total por ticket con el último reporte de medicion/resultados (±1 %).
 * Uso: npm run build && tsx --env-file-if-exists=.env scripts/agente/diagnostico-contexto.ts
 * Solo escribe en la salida estándar; no guarda textos de tickets.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarConjunto } from '../medicion/conjunto.js';
import { contextoV1, type Llamador, type RespuestaMedida } from '../medicion/estrategias.js';
import { RAIZ, conectarV1, conectarV2, medirResultado } from './conexion.js';

export interface LlamadaV1 {
  tool: string;
  caracteres: number;
  filas: number | null;
  /** Filas que pertenecen al ticket (solo listar_tareas_responsable, por NRO_TICKET). */
  filasDelTicket?: number;
}

export interface SeccionV2 {
  seccion: string;
  elementos: number | null;
  caracteres: number;
  /** Caracteres de los textos largos de la sección (texto en historial, descripcion en tareas). */
  caracteresTextoLargo?: number;
}

export interface DiagnosticoTicket {
  ticketId: number;
  v1: { llamadas: LlamadaV1[]; total: number };
  v2: { secciones: SeccionV2[]; caracteresResumen: number; caracteresJson: number; total: number };
}

/** Parsea el texto de la v1 y cuenta filas si es un arreglo JSON (o un objeto con un arreglo). */
export function filasV1(texto: string): unknown[] | null {
  try {
    const json: unknown = JSON.parse(texto);
    if (Array.isArray(json)) return json;
    if (json && typeof json === 'object') {
      const arreglo = Object.values(json).find(Array.isArray);
      if (arreglo) return arreglo as unknown[];
    }
  } catch {
    // no es JSON: se informa sin filas
  }
  return null;
}

const largo = (v: unknown) => JSON.stringify(v ?? null).length;

/** Desglosa el structuredContent de obtener_contexto_ticket (sin guardar textos). */
export function desglosarV2(estructurado: Record<string, unknown>): SeccionV2[] {
  return Object.entries(estructurado).map(([seccion, valor]) => {
    const fila: SeccionV2 = { seccion, elementos: Array.isArray(valor) ? valor.length : null, caracteres: largo(valor) };
    if (Array.isArray(valor) && (seccion === 'historial' || seccion === 'tareas')) {
      const campo = seccion === 'historial' ? 'texto' : 'descripcion';
      fila.caracteresTextoLargo = valor.reduce((s: number, e: Record<string, unknown>) => s + (typeof e[campo] === 'string' ? (e[campo] as string).length : 0), 0);
    }
    return fila;
  });
}

/** Desglose de la v1: reutiliza la estrategia de medicion-eficiencia y registra cada llamada. */
export async function diagnosticarV1(llamar: Llamador, ticketId: number, hoy: string): Promise<DiagnosticoTicket['v1']> {
  const llamadas: LlamadaV1[] = [];
  const registrar: Llamador = async (tool, argumentos) => {
    const r: RespuestaMedida = await llamar(tool, argumentos);
    const filas = filasV1(r.texto);
    const llamada: LlamadaV1 = { tool, caracteres: r.caracteresTexto, filas: filas?.length ?? null };
    if (tool === 'listar_tareas_responsable' && filas) {
      llamada.filasDelTicket = filas.filter((f) => Number((f as Record<string, unknown>).NRO_TICKET) === ticketId).length;
    }
    llamadas.push(llamada);
    return r;
  };
  const medido = await contextoV1(registrar, ticketId, hoy);
  return { llamadas, total: medido.caracteresTexto };
}

export function diagnosticarV2(crudo: unknown): DiagnosticoTicket['v2'] {
  const resultado = crudo as { content?: { type: string; text?: string }[]; structuredContent?: Record<string, unknown> };
  const textos = (resultado.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '');
  return {
    secciones: desglosarV2(resultado.structuredContent ?? {}),
    caracteresResumen: textos[0]?.length ?? 0,
    caracteresJson: textos.slice(1).reduce((s, t) => s + t.length, 0),
    total: medirResultado(crudo).caracteresTexto,
  };
}

const num = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('es-AR'));

export function aMarkdown(d: DiagnosticoTicket): string {
  return [
    `### #${d.ticketId}`,
    '',
    '| v1: llamada | Caracteres | Filas |',
    '|---|---:|---:|',
    ...d.v1.llamadas.map(
      (l) => `| ${l.tool} | ${num(l.caracteres)} | ${num(l.filas)}${l.filasDelTicket !== undefined ? ` (${l.filasDelTicket} del ticket)` : ''} |`,
    ),
    `| **Total v1** | **${num(d.v1.total)}** | |`,
    '',
    '| v2: sección | Caracteres | Elementos | Textos largos |',
    '|---|---:|---:|---:|',
    ...d.v2.secciones.map((s) => `| ${s.seccion} | ${num(s.caracteres)} | ${num(s.elementos)} | ${num(s.caracteresTextoLargo)} |`),
    `| resumen (content[0]) | ${num(d.v2.caracteresResumen)} | | |`,
    `| JSON (content[1]) | ${num(d.v2.caracteresJson)} | | |`,
    `| **Total v2 (content)** | **${num(d.v2.total)}** | | |`,
    '',
  ].join('\n');
}

const dos = (n: number) => String(n).padStart(2, '0');

async function ultimoReporte(): Promise<{ nombre: string; filas: { caso: string; caracteresV1: number; caracteresTextoV2: number }[] } | null> {
  const carpeta = join(RAIZ, 'medicion', 'resultados');
  const archivos = (await readdir(carpeta).catch(() => [])).filter((a) => a.endsWith('.json')).sort();
  const nombre = archivos.at(-1);
  if (!nombre) return null;
  return { nombre, ...JSON.parse(await readFile(join(carpeta, nombre), 'utf8')) };
}

const dentroDe1 = (medido: number, referencia: number) => Math.abs(medido - referencia) <= referencia * 0.01;

async function principal() {
  const conjunto = cargarConjunto(JSON.parse(await readFile(join(RAIZ, 'medicion', 'tickets.json'), 'utf8')));
  const ahora = new Date();
  const hoy = `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`;
  const v1 = await conectarV1();
  const v2 = await conectarV2();
  const diagnosticos: DiagnosticoTicket[] = [];
  try {
    for (const ticketId of conjunto.tickets) {
      diagnosticos.push({
        ticketId,
        v1: await diagnosticarV1(v1.llamar, ticketId, hoy),
        v2: diagnosticarV2(await v2.llamarCrudo('obtener_contexto_ticket', { ticketId })),
      });
    }
  } finally {
    await Promise.allSettled([v1.cerrar(), v2.cerrar()]);
  }

  const salida = [`# Diagnóstico del contexto (${ahora.toISOString()})`, '', ...diagnosticos.map(aMarkdown)];
  const reporte = await ultimoReporte();
  if (reporte) {
    salida.push(`## Comparación con ${reporte.nombre} (±1 %)`, '', '| Ticket | v1 | Reporte v1 | v2 | Reporte v2 | OK |', '|---|---:|---:|---:|---:|---|');
    for (const d of diagnosticos) {
      const fila = reporte.filas.find((f) => f.caso === `contexto #${d.ticketId}`);
      if (!fila) continue;
      const ok = dentroDe1(d.v1.total, fila.caracteresV1) && dentroDe1(d.v2.total, fila.caracteresTextoV2);
      salida.push(`| #${d.ticketId} | ${num(d.v1.total)} | ${num(fila.caracteresV1)} | ${num(d.v2.total)} | ${num(fila.caracteresTextoV2)} | ${ok ? 'sí' : 'NO'} |`);
    }
  }
  process.stdout.write(`${salida.join('\n')}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

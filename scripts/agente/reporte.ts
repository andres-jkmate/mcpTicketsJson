/**
 * Costo y reporte comparativo (spec "Costo calculado con precios configurables" y "Reporte
 * comparativo"). Se arma solo desde los registros .jsonl y precios.json, sin llamar al modelo.
 * El reporte lleva números, ids de caso y motivos de fin: nunca textos de tickets, respuestas del
 * agente ni credenciales.
 */
import type { IdCaso } from './casos.js';
import { precioDe, type PrecioModelo, type Precios, type Version } from './configuracion.js';
import type { TamanoTools } from './herramientas.js';
import type { FinCorrida, UsoTurno } from './loop.js';
import type { LineaCorrida, RegistrosLeidos } from './registro.js';

export const SIN_EXITOS = 'sin éxitos';

export function costoUso(u: UsoTurno, p: PrecioModelo): number {
  return (u.input_tokens * p.entrada + u.output_tokens * p.salida + u.cache_read_input_tokens * p.lecturaCache + u.cache_creation_input_tokens * p.escrituraCache) / 1_000_000;
}

export function costoCorrida(c: LineaCorrida, precios: Precios): number {
  const p = precioDe(precios, c.modelo);
  return c.resultado.turnos.reduce((s, t) => s + costoUso(t.usage, p), 0);
}

export interface Rango {
  mediana: number;
  min: number;
  max: number;
}

export function rango(valores: number[]): Rango | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return { mediana: v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2, min: v[0]!, max: v.at(-1)! };
}

const METRICAS = ['turnos', 'tokensEntrada', 'tokensSalida', 'tokensLecturaCache', 'tokensEscrituraCache', 'costoUsd', 'tiempoTotalMs', 'tiempoModeloMs', 'tiempoToolsMs'] as const;
type Metrica = (typeof METRICAS)[number];

export interface Estadisticas {
  corridas: number;
  exitosas: number;
  tasaExito: number | null;
  erroresTool: number;
  erroresParametro: number;
  costoTotalUsd: number;
  /** Costo total / corridas exitosas; "sin éxitos" si no hubo ninguna. */
  costoPorTareaBienResuelta: number | typeof SIN_EXITOS;
  fines: Partial<Record<FinCorrida, number>>;
  metricas: Record<Metrica, Rango | null>;
}

export interface Diferencia {
  /** (v2 − v1) / v1, en %; negativo = la v2 cuesta o tarda menos. */
  costoMedianoPct: number | null;
  costoPorTareaBienResueltaPct: number | null;
  tiempoMedianoPct: number | null;
  /** Diferencia de tasa de éxito, en puntos porcentuales. */
  tasaExitoPp: number | null;
}

export interface ReporteAgente {
  fecha: string;
  ejecucion: string;
  modelo: string;
  effort: string;
  repeticiones: number;
  cortadaPorTope: boolean;
  preciosUsdPorMTok: PrecioModelo;
  tools: Partial<Record<Version, TamanoTools>>;
  casos: { caso: IdCaso; v1: Estadisticas | null; v2: Estadisticas | null; diferencia: Diferencia }[];
  totales: { v1: Estadisticas | null; v2: Estadisticas | null; diferencia: Diferencia };
}

function metricasCorrida(c: LineaCorrida, precios: Precios): Record<Metrica, number> {
  const t = c.resultado.turnos;
  const suma = (k: keyof UsoTurno) => t.reduce((s, x) => s + x.usage[k], 0);
  return {
    turnos: t.length,
    tokensEntrada: suma('input_tokens'),
    tokensSalida: suma('output_tokens'),
    tokensLecturaCache: suma('cache_read_input_tokens'),
    tokensEscrituraCache: suma('cache_creation_input_tokens'),
    costoUsd: costoCorrida(c, precios),
    tiempoTotalMs: c.resultado.tiempoTotalMs,
    tiempoModeloMs: c.resultado.tiempoModeloMs,
    tiempoToolsMs: c.resultado.tiempoToolsMs,
  };
}

export function estadisticas(corridas: LineaCorrida[], precios: Precios): Estadisticas | null {
  if (!corridas.length) return null;
  const medidas = corridas.map((c) => metricasCorrida(c, precios));
  const exitosas = corridas.filter((c) => c.verificacion.exito).length;
  const costoTotalUsd = medidas.reduce((s, m) => s + m.costoUsd, 0);
  const fines: Partial<Record<FinCorrida, number>> = {};
  for (const c of corridas) fines[c.resultado.fin] = (fines[c.resultado.fin] ?? 0) + 1;
  return {
    corridas: corridas.length,
    exitosas,
    tasaExito: exitosas / corridas.length,
    erroresTool: corridas.reduce((s, c) => s + c.resultado.erroresTool, 0),
    erroresParametro: corridas.reduce((s, c) => s + c.resultado.erroresParametro, 0),
    costoTotalUsd,
    costoPorTareaBienResuelta: exitosas ? costoTotalUsd / exitosas : SIN_EXITOS,
    fines,
    metricas: Object.fromEntries(METRICAS.map((k) => [k, rango(medidas.map((m) => m[k]))])) as Record<Metrica, Rango | null>,
  };
}

const pct = (v1: number | undefined | null, v2: number | undefined | null) =>
  v1 === undefined || v1 === null || v2 === undefined || v2 === null || v1 === 0 ? null : Math.round(((v2 - v1) / v1) * 1000) / 10;

export function diferencia(v1: Estadisticas | null, v2: Estadisticas | null): Diferencia {
  const porExito = (e: Estadisticas | null) => (e && typeof e.costoPorTareaBienResuelta === 'number' ? e.costoPorTareaBienResuelta : null);
  return {
    costoMedianoPct: pct(v1?.metricas.costoUsd?.mediana, v2?.metricas.costoUsd?.mediana),
    costoPorTareaBienResueltaPct: pct(porExito(v1), porExito(v2)),
    tiempoMedianoPct: pct(v1?.metricas.tiempoTotalMs?.mediana, v2?.metricas.tiempoTotalMs?.mediana),
    tasaExitoPp: v1?.tasaExito != null && v2?.tasaExito != null ? Math.round((v2.tasaExito - v1.tasaExito) * 1000) / 10 : null,
  };
}

export function armarReporte(r: RegistrosLeidos, precios: Precios, fecha: Date): ReporteAgente {
  const { ejecucion } = r;
  // Una corrida cortada por el tope de costo quedó a medias: no entra en las estadísticas.
  const corridas = r.corridas.filter((c) => c.resultado.fin !== 'tope_costo');
  const de = (caso: IdCaso | null, version: Version) => corridas.filter((c) => (caso === null || c.caso === caso) && c.version === version);
  const casos = ejecucion.casos.map((caso) => {
    const v1 = estadisticas(de(caso, 'v1'), precios);
    const v2 = estadisticas(de(caso, 'v2'), precios);
    return { caso, v1, v2, diferencia: diferencia(v1, v2) };
  });
  const v1 = estadisticas(de(null, 'v1'), precios);
  const v2 = estadisticas(de(null, 'v2'), precios);
  return {
    fecha: fecha.toISOString(),
    ejecucion: ejecucion.id,
    modelo: ejecucion.modelo,
    effort: ejecucion.effort,
    repeticiones: ejecucion.repeticiones,
    cortadaPorTope: r.fin?.cortadaPorTope ?? false,
    preciosUsdPorMTok: precioDe(precios, ejecucion.modelo),
    tools: ejecucion.tools,
    casos,
    totales: { v1, v2, diferencia: diferencia(v1, v2) },
  };
}

// ---------------------------------------------------------------- Markdown

const n = (v: number, decimales = 0) => v.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
const usd = (v: number) => `US$ ${n(v, 4)}`;
const seg = (ms: number) => `${n(ms / 1000, 1)} s`;
const conSigno = (v: number | null, unidad: string) => (v === null ? '—' : `${v > 0 ? '+' : ''}${n(v, 1)} ${unidad}`);

function celdaRango(r: Rango | null | undefined, formato: (v: number) => string): string {
  if (!r) return '—';
  return r.min === r.max ? formato(r.mediana) : `${formato(r.mediana)} (${formato(r.min)}–${formato(r.max)})`;
}

function tabla(v1: Estadisticas | null, v2: Estadisticas | null, d: Diferencia): string[] {
  const fila = (nombre: string, f: (e: Estadisticas) => string, dif = '') => `| ${nombre} | ${v1 ? f(v1) : '—'} | ${v2 ? f(v2) : '—'} | ${dif} |`;
  const porExito = (e: Estadisticas) => (typeof e.costoPorTareaBienResuelta === 'number' ? usd(e.costoPorTareaBienResuelta) : SIN_EXITOS);
  const m = (k: Metrica, formato: (v: number) => string) => (e: Estadisticas) => celdaRango(e.metricas[k], formato);
  return [
    '| | v1 | v2 | Diferencia v1 → v2 |',
    '|---|---:|---:|---:|',
    fila('Éxito', (e) => `${e.exitosas}/${e.corridas}`, conSigno(d.tasaExitoPp, 'pp')),
    fila('**Costo por tarea bien resuelta**', porExito, conSigno(d.costoPorTareaBienResueltaPct, '%')),
    fila('Costo por corrida', m('costoUsd', usd), conSigno(d.costoMedianoPct, '%')),
    fila('Tiempo total', m('tiempoTotalMs', seg), conSigno(d.tiempoMedianoPct, '%')),
    fila('Tiempo del modelo', m('tiempoModeloMs', seg)),
    fila('Tiempo de las tools', m('tiempoToolsMs', seg)),
    fila('Turnos', m('turnos', (v) => n(v, 1).replace(/,0$/, ''))),
    fila('Tokens de entrada', m('tokensEntrada', n)),
    fila('Tokens de salida', m('tokensSalida', n)),
    fila('Tokens de lectura de caché', m('tokensLecturaCache', n)),
    fila('Tokens de escritura de caché', m('tokensEscrituraCache', n)),
    fila('Errores de tool (de parámetros)', (e) => `${e.erroresTool} (${e.erroresParametro})`),
    fila('Fin de las corridas', (e) => Object.entries(e.fines).map(([k, v]) => `${k}: ${v}`).join(', ')),
  ];
}

export function aMarkdown(r: ReporteAgente): string {
  const tools = (v: Version) => {
    const t = r.tools[v];
    return t ? `${t.cantidad} tools, ${n(t.caracteres)} caracteres, ${t.tokens === null ? '—' : n(t.tokens)} tokens` : '—';
  };
  const p = r.preciosUsdPorMTok;
  return [
    '# Medición con agente: v1 contra v2',
    '',
    `Fecha: ${r.fecha} · Ejecución: \`${r.ejecucion}\``,
    '',
    `Modelo \`${r.modelo}\`, effort \`${r.effort}\`, ${r.repeticiones} repeticiones por caso y versión. ` +
      `Precios (USD/MTok): entrada ${n(p.entrada, 2)}, salida ${n(p.salida, 2)}, lectura de caché ${n(p.lecturaCache, 2)}, escritura de caché ${n(p.escrituraCache, 2)}.`,
    '',
    `- Tools v1: ${tools('v1')}`,
    `- Tools v2: ${tools('v2')}`,
    ...(r.cortadaPorTope ? ['', '> **La ejecución se cortó por tope de costo.** Los resultados son parciales.'] : []),
    '',
    'Mediana (mínimo–máximo). Costo por tarea bien resuelta = costo total de las repeticiones / corridas exitosas. ' +
      'Diferencia = (v2 − v1) / v1 sobre la mediana; negativa = la v2 cuesta o tarda menos.',
    '',
    ...r.casos.flatMap((c) => [`## ${c.caso}`, '', ...tabla(c.v1, c.v2, c.diferencia), '']),
    '## Total',
    '',
    ...tabla(r.totales.v1, r.totales.v2, r.totales.diferencia),
    '',
    '## Límites declarados',
    '',
    '- El prompt de sistema es corto y neutro: las cifras absolutas son menores que en Claude Desktop o Claude Code, pero es el mismo para las dos versiones.',
    '- Las escrituras se interceptan y se responden con plantillas: no se reproducen los errores de los SP de escritura, más allá de las verificaciones referenciales mínimas (ticket y desarrollador existentes).',
    '',
  ].join('\n');
}

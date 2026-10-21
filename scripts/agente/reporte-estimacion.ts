/**
 * Reporte del estimador sin API (spec "Estimación sin API", design D12). Se arma desde las medidas
 * en caracteres de cada conversación simulada: lleva números, ids de caso y supuestos, nunca textos de
 * tickets ni credenciales.
 */
import type { IdCaso } from './casos.js';
import type { PrecioModelo, Version } from './configuracion.js';
import { ESCENARIOS, tokensConversacion, type ConversacionMedida, type Escenario } from './estimador.js';
import type { SupuestosEstimacion } from './guiones.js';
import { costoUso } from './reporte.js';

/** Razones de caracteres por token del rango que pide la spec. */
export const RAZONES_RANGO = [3, 4] as const;

export interface MedicionEstimada {
  caso: IdCaso;
  version: Version;
  conversacion: ConversacionMedida;
}

export interface TotalesEscenario {
  entrada: number;
  lecturaCache: number;
  escrituraCache: number;
  salida: number;
  costoUsd: number;
}

export interface EstimacionVersion {
  turnos: number;
  llamadas: number;
  erroresTool: number;
  escenarios: Record<Escenario, TotalesEscenario>;
}

/** (v2 − v1) / v1 del costo, en %; negativo = la v2 cuesta menos. */
export type DiferenciaCosto = Record<Escenario, number | null>;

export interface FilaRango {
  razon: number;
  v1: Record<Escenario, number> | null;
  v2: Record<Escenario, number> | null;
  diferencia: DiferenciaCosto;
}

export interface ReporteEstimacion {
  tipo: 'estimacion';
  fecha: string;
  modelo: string;
  preciosUsdPorMTok: PrecioModelo;
  supuestos: SupuestosEstimacion;
  /** Definiciones de tools que recibe el modelo en cada turno. */
  tools: Partial<Record<Version, { cantidad: number; caracteres: number; tokens: number; costoPrefijoPorTurnoUsd: Record<Escenario, number> }>>;
  casos: { caso: IdCaso; v1: EstimacionVersion | null; v2: EstimacionVersion | null; diferencia: DiferenciaCosto }[];
  totales: { v1: EstimacionVersion | null; v2: EstimacionVersion | null; diferencia: DiferenciaCosto };
  rango: FilaRango[];
  /** Medidas en caracteres por turno, para recalcular con otros supuestos. */
  mediciones: MedicionEstimada[];
}

const vacio = (): TotalesEscenario => ({ entrada: 0, lecturaCache: 0, escrituraCache: 0, salida: 0, costoUsd: 0 });

function estimar(m: ConversacionMedida, s: SupuestosEstimacion, razon: number, precio: PrecioModelo): EstimacionVersion {
  const tokens = tokensConversacion(m, s, razon);
  const escenarios = Object.fromEntries(
    ESCENARIOS.map((e) => {
      const t = vacio();
      for (const u of tokens[e]) {
        t.entrada += u.input_tokens;
        t.lecturaCache += u.cache_read_input_tokens;
        t.escrituraCache += u.cache_creation_input_tokens;
        t.salida += u.output_tokens;
        t.costoUsd += costoUso(u, precio);
      }
      return [e, t];
    }),
  ) as Record<Escenario, TotalesEscenario>;
  const llamadas = m.turnos.flatMap((t) => t.llamadas);
  return { turnos: m.turnos.length, llamadas: llamadas.length, erroresTool: llamadas.filter((l) => l.error).length, escenarios };
}

function sumar(estimaciones: EstimacionVersion[]): EstimacionVersion | null {
  if (!estimaciones.length) return null;
  const escenarios = Object.fromEntries(
    ESCENARIOS.map((e) => {
      const t = vacio();
      for (const x of estimaciones) for (const k of Object.keys(t) as (keyof TotalesEscenario)[]) t[k] += x.escenarios[e][k];
      return [e, t];
    }),
  ) as Record<Escenario, TotalesEscenario>;
  const suma = (k: 'turnos' | 'llamadas' | 'erroresTool') => estimaciones.reduce((a, x) => a + x[k], 0);
  return { turnos: suma('turnos'), llamadas: suma('llamadas'), erroresTool: suma('erroresTool'), escenarios };
}

const pct = (v1: number | undefined, v2: number | undefined) =>
  v1 === undefined || v2 === undefined || v1 === 0 ? null : Math.round(((v2 - v1) / v1) * 1000) / 10;

function diferencia(v1: EstimacionVersion | null, v2: EstimacionVersion | null): DiferenciaCosto {
  return Object.fromEntries(ESCENARIOS.map((e) => [e, pct(v1?.escenarios[e].costoUsd, v2?.escenarios[e].costoUsd)])) as DiferenciaCosto;
}

export function armarReporteEstimacion(
  mediciones: MedicionEstimada[],
  supuestos: SupuestosEstimacion,
  modelo: string,
  precio: PrecioModelo,
  fecha: Date,
): ReporteEstimacion {
  const razon = supuestos.razonCaracteresPorToken;
  const casosIds = [...new Set(mediciones.map((m) => m.caso))];
  const de = (caso: IdCaso | null, version: Version, r = razon) =>
    mediciones.filter((m) => (caso === null || m.caso === caso) && m.version === version).map((m) => estimar(m.conversacion, supuestos, r, precio));

  const casos = casosIds.map((caso) => {
    const v1 = de(caso, 'v1')[0] ?? null;
    const v2 = de(caso, 'v2')[0] ?? null;
    return { caso, v1, v2, diferencia: diferencia(v1, v2) };
  });
  const v1 = sumar(de(null, 'v1'));
  const v2 = sumar(de(null, 'v2'));

  const rango = RAZONES_RANGO.map((r): FilaRango => {
    const t1 = sumar(de(null, 'v1', r));
    const t2 = sumar(de(null, 'v2', r));
    const costos = (t: EstimacionVersion | null) => (t ? (Object.fromEntries(ESCENARIOS.map((e) => [e, t.escenarios[e].costoUsd])) as Record<Escenario, number>) : null);
    return { razon: r, v1: costos(t1), v2: costos(t2), diferencia: diferencia(t1, t2) };
  });

  const tools: ReporteEstimacion['tools'] = {};
  for (const m of mediciones) {
    if (tools[m.version]) continue;
    const c = m.conversacion;
    const tokens = c.caracteresTools / razon;
    tools[m.version] = {
      cantidad: c.cantidadTools,
      caracteres: c.caracteresTools,
      tokens,
      // Lo que cuesta re-enviar las definiciones en cada turno: leídas de la caché o como entrada.
      costoPrefijoPorTurnoUsd: { sesionCaliente: (tokens * precio.lecturaCache) / 1_000_000, sinCache: (tokens * precio.entrada) / 1_000_000 },
    };
  }

  return {
    tipo: 'estimacion',
    fecha: fecha.toISOString(),
    modelo,
    preciosUsdPorMTok: precio,
    supuestos,
    tools,
    casos,
    totales: { v1, v2, diferencia: diferencia(v1, v2) },
    rango,
    mediciones,
  };
}

// ---------------------------------------------------------------- Markdown

const n = (v: number, decimales = 0) => v.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
const usd = (v: number) => `US$ ${n(v, 4)}`;
const conSigno = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${n(v, 1)} %`);
const ESCENARIO: Record<Escenario, string> = { sesionCaliente: 'sesión caliente', sinCache: 'sin caché' };

function tabla(v1: EstimacionVersion | null, v2: EstimacionVersion | null, d: DiferenciaCosto): string[] {
  const fila = (nombre: string, f: (e: EstimacionVersion) => string, dif = '') => `| ${nombre} | ${v1 ? f(v1) : '—'} | ${v2 ? f(v2) : '—'} | ${dif} |`;
  const c = (e: Escenario, k: keyof TotalesEscenario) => (x: EstimacionVersion) => n(x.escenarios[e][k]);
  return [
    '| | v1 | v2 | Diferencia v1 → v2 |',
    '|---|---:|---:|---:|',
    fila('**Costo, sesión caliente**', (x) => usd(x.escenarios.sesionCaliente.costoUsd), conSigno(d.sesionCaliente)),
    fila('Costo, sin caché', (x) => usd(x.escenarios.sinCache.costoUsd), conSigno(d.sinCache)),
    fila('Turnos (requests al modelo)', (x) => n(x.turnos)),
    fila('Llamadas a tools', (x) => `${n(x.llamadas)}${x.erroresTool ? ` (${x.erroresTool} con error)` : ''}`),
    fila('Entrada sin caché (sesión caliente)', c('sesionCaliente', 'entrada')),
    fila('Lectura de caché (sesión caliente)', c('sesionCaliente', 'lecturaCache')),
    fila('Escritura de caché (sesión caliente)', c('sesionCaliente', 'escrituraCache')),
    fila('Entrada total (sin caché)', c('sinCache', 'entrada')),
    fila('Salida', c('sinCache', 'salida')),
  ];
}

export function aMarkdownEstimacion(r: ReporteEstimacion): string {
  const s = r.supuestos;
  const p = r.preciosUsdPorMTok;
  const tools = (v: Version) => {
    const t = r.tools[v];
    return t
      ? `${t.cantidad} tools, ${n(t.caracteres)} caracteres ≈ ${n(t.tokens)} tokens por turno ` +
          `(${usd(t.costoPrefijoPorTurnoUsd.sesionCaliente)} por turno leídas de la caché, ${usd(t.costoPrefijoPorTurnoUsd.sinCache)} sin caché)`
      : '—';
  };
  const costoRango = (x: Record<Escenario, number> | null, e: Escenario) => (x ? usd(x[e]) : '—');
  return [
    '# Estimación de tokens y costo: v1 contra v2',
    '',
    '> **Es una estimación, no una medición.** No se llamó a la API de Anthropic: se simuló una conversación fija por caso y versión ' +
      '(`medicion/agente/guiones.json`) con las definiciones de tools y las respuestas reales de los dos servidores, y los caracteres se ' +
      'convirtieron a tokens con una razón fija. No incluye el thinking real, el largo real de las respuestas, las llamadas de más, ' +
      'los reintentos ni la tasa de éxito.',
    '',
    `Fecha: ${r.fecha} · Modelo \`${r.modelo}\`. Precios (USD/MTok): entrada ${n(p.entrada, 2)}, salida ${n(p.salida, 2)}, ` +
      `lectura de caché ${n(p.lecturaCache, 2)}, escritura de caché ${n(p.escrituraCache, 2)}.`,
    '',
    '## Supuestos',
    '',
    `- Razón: ${s.razonCaracteresPorToken.toLocaleString('es-AR')} caracteres por token (rango con ${RAZONES_RANGO.join(' y ')} al final).`,
    `- Prompt de tool use que agrega la API: ${n(s.promptToolUse)} tokens por request, igual en las dos versiones.`,
    `- Thinking: ${n(s.thinkingPorTurno)} tokens de salida por turno; no vuelve al historial.`,
    `- Respuesta final: ${n(s.respuestaFinal)} tokens de salida en el último turno.`,
    '- Salida de cada turno = argumentos de las llamadas + thinking (+ respuesta final). Los supuestos son iguales para las dos versiones.',
    '- **Sesión caliente** (escenario principal): las tools y el sistema ya están en caché; cada turno lee el request anterior y escribe lo nuevo. **Sin caché**: toda la entrada se paga como entrada normal (cota superior).',
    '',
    '## Definiciones de tools',
    '',
    `- v1: ${tools('v1')}`,
    `- v2: ${tools('v2')}`,
    '',
    'Tokens estimados con la razón. Diferencia = (v2 − v1) / v1; negativa = la v2 cuesta menos.',
    '',
    ...r.casos.flatMap((c) => [`## ${c.caso}`, '', ...tabla(c.v1, c.v2, c.diferencia), '']),
    '## Total (los casos, una vez cada uno)',
    '',
    ...tabla(r.totales.v1, r.totales.v2, r.totales.diferencia),
    '',
    '## Rango según la razón de caracteres por token',
    '',
    '| Razón | v1 sesión caliente | v2 sesión caliente | Diferencia | v1 sin caché | v2 sin caché | Diferencia |',
    '|---:|---:|---:|---:|---:|---:|---:|',
    ...r.rango.map(
      (f) =>
        `| ${n(f.razon, 1)} | ${costoRango(f.v1, 'sesionCaliente')} | ${costoRango(f.v2, 'sesionCaliente')} | ${conSigno(f.diferencia.sesionCaliente)} | ` +
        `${costoRango(f.v1, 'sinCache')} | ${costoRango(f.v2, 'sinCache')} | ${conSigno(f.diferencia.sinCache)} |`,
    ),
    '',
    `Escenarios: ${ESCENARIOS.map((e) => ESCENARIO[e]).join(' y ')}. Las cifras con agente real las da \`npm run medir:agente\` cuando haya credenciales de la API.`,
    '',
  ].join('\n');
}

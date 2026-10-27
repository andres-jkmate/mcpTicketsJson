/**
 * Criterios de búsqueda que resuelve el servidor y no el modelo: el rango de fechas (períodos
 * relativos y defaults, con `hoy` inyectado) y el rango del importe aproximado. Funciones puras:
 * el SP recibe siempre valores explícitos y `criterio` muestra lo mismo que se aplicó.
 */

export const PERIODOS = ['hoy', 'ayer', 'esta_semana', 'este_mes', 'mes_pasado'] as const;
export type Periodo = (typeof PERIODOS)[number];

/** Tolerancia del importe aproximado: ±5 %. */
export const TOLERANCIA_IMPORTE = 0.05;

export interface PedidoFechas {
  periodo?: Periodo | undefined;
  fechaDesde?: string | undefined;
  fechaHasta?: string | undefined;
  hayNumero: boolean;
}

export type RangoFechas = { ok: true; fechaDesde: string | null; fechaHasta: string | null } | { ok: false; motivo: string };

const dos = (n: number) => String(n).padStart(2, '0');

function aTexto(d: Date): string {
  return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`;
}

function desdeTexto(fecha: string): Date {
  return new Date(`${fecha}T00:00:00Z`);
}

function sumarDias(fecha: string, dias: number): string {
  const d = desdeTexto(fecha);
  d.setUTCDate(d.getUTCDate() + dias);
  return aTexto(d);
}

/** Mismo día del mes anterior; si no existe (31 de marzo), el último día de ese mes. */
function restarMes(fecha: string): string {
  const d = desdeTexto(fecha);
  const ultimoDelAnterior = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)).getUTCDate();
  return aTexto(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, Math.min(d.getUTCDate(), ultimoDelAnterior))));
}

function rangoDePeriodo(periodo: Periodo, hoy: string): [string, string] {
  const d = desdeTexto(hoy);
  switch (periodo) {
    case 'hoy':
      return [hoy, hoy];
    case 'ayer': {
      const ayer = sumarDias(hoy, -1);
      return [ayer, ayer];
    }
    case 'esta_semana': // de lunes a hoy
      return [sumarDias(hoy, -((d.getUTCDay() + 6) % 7)), hoy];
    case 'este_mes':
      return [`${hoy.slice(0, 8)}01`, hoy];
    case 'mes_pasado':
      return [
        aTexto(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))),
        aTexto(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0))),
      ];
  }
}

/**
 * Rango de fechas a aplicar (`AAAA-MM-DD`, ambos inclusive). Sin nada: el último mes; con número
 * y sin fechas: sin rango (null, null). `periodo` y las fechas explícitas son excluyentes.
 */
export function resolverFechas({ periodo, fechaDesde, fechaHasta, hayNumero }: PedidoFechas, hoy: string): RangoFechas {
  const hayFechas = fechaDesde !== undefined || fechaHasta !== undefined;
  if (periodo !== undefined) {
    if (hayFechas) return { ok: false, motivo: 'Indicá periodo o fechaDesde/fechaHasta, no los dos' };
    const [desde, hasta] = rangoDePeriodo(periodo, hoy);
    return { ok: true, fechaDesde: desde, fechaHasta: hasta };
  }
  if (!hayFechas) return hayNumero ? { ok: true, fechaDesde: null, fechaHasta: null } : { ok: true, fechaDesde: restarMes(hoy), fechaHasta: hoy };

  const hasta = fechaHasta ?? hoy;
  const desde = fechaDesde ?? restarMes(hasta);
  if (desde > hasta) return { ok: false, motivo: `fechaDesde (${desde}) es posterior a fechaHasta (${hasta})` };
  return { ok: true, fechaDesde: desde, fechaHasta: hasta };
}

export interface RangoImporte {
  importe: number | null;
  importeMin: number | null;
  importeMax: number | null;
}

const milesimos = (valor: number) => Math.round(valor * 1000) / 1000;

/** Rango del importe: ±5 % o exacto. Sin importe, todo null. */
export function resolverImporte(importe: number | undefined, exacto: boolean): RangoImporte {
  if (importe === undefined) return { importe: null, importeMin: null, importeMax: null };
  if (exacto) return { importe, importeMin: importe, importeMax: importe };
  return { importe, importeMin: milesimos(importe * (1 - TOLERANCIA_IMPORTE)), importeMax: milesimos(importe * (1 + TOLERANCIA_IMPORTE)) };
}

/** Hoy según el reloj local del proceso, que corre en la misma máquina que Claude Desktop. */
export function hoyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

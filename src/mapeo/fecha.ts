/**
 * Fechas de Firebird. TIMESTAMP y DATE no tienen zona: guardan la hora de reloj de
 * ZONA_HORARIA_BASE. Acá se representan como "reloj": un Date cuyos campos UTC son esa hora
 * de reloj (la capa de datos lo arma así, ver db/firebird.ts). Solo al serializar se aplica
 * la zona para obtener el offset.
 */

const PATRON_TEXTO = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/;

/** Construye un "reloj" desde 'AAAA-MM-DD[ HH:mm[:ss[.SSS]]]'. */
export function relojDesdeTexto(texto: string): Date {
  const m = PATRON_TEXTO.exec(texto.trim());
  if (!m) throw new Error(`Fecha con formato inválido: ${texto}`);
  const [, a, mes, d, h = '0', min = '0', s = '0', ms = '0'] = m;
  return new Date(Date.UTC(+a!, +mes! - 1, +d!, +h, +min, +s, +ms.padEnd(3, '0')));
}

const formateadores = new Map<string, Intl.DateTimeFormat>();

function formateadorOffset(zona: string): Intl.DateTimeFormat {
  let f = formateadores.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zona, timeZoneName: 'longOffset' });
    formateadores.set(zona, f);
  }
  return f;
}

/** Offset en minutos de `zona` en el instante `instanteUtc` (ej. -180 para -03:00). */
function offsetEnInstante(zona: string, instanteUtc: number): number {
  const nombre = formateadorOffset(zona)
    .formatToParts(new Date(instanteUtc))
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(nombre ?? '');
  if (!m) return 0; // "GMT" a secas = UTC
  const minutos = +m[2]! * 60 + +(m[3] ?? 0);
  return m[1] === '-' ? -minutos : minutos;
}

/** Offset en minutos que corresponde a una hora de reloj de `zona` (resuelve cambios de horario). */
export function offsetDeReloj(reloj: Date, zona: string): number {
  const comoUtc = reloj.getTime();
  let offset = offsetEnInstante(zona, comoUtc);
  offset = offsetEnInstante(zona, comoUtc - offset * 60_000);
  return offset;
}

const dos = (n: number) => String(n).padStart(2, '0');

function formatearOffset(minutos: number): string {
  const signo = minutos < 0 ? '-' : '+';
  const abs = Math.abs(minutos);
  return `${signo}${dos(Math.floor(abs / 60))}:${dos(abs % 60)}`;
}

/** 'AAAA-MM-DD' de un reloj. */
export function aFecha(reloj: Date): string {
  return `${reloj.getUTCFullYear()}-${dos(reloj.getUTCMonth() + 1)}-${dos(reloj.getUTCDate())}`;
}

/** ISO 8601 con offset. Los milisegundos solo aparecen si no son cero. */
export function aFechaHoraIso(reloj: Date | string, zona: string): string {
  const r = typeof reloj === 'string' ? relojDesdeTexto(reloj) : reloj;
  const ms = r.getUTCMilliseconds();
  const hora = `${dos(r.getUTCHours())}:${dos(r.getUTCMinutes())}:${dos(r.getUTCSeconds())}`;
  const fraccion = ms ? `.${String(ms).padStart(3, '0')}` : '';
  return `${aFecha(r)}T${hora}${fraccion}${formatearOffset(offsetDeReloj(r, zona))}`;
}

export function aFechaHoraIsoONull(reloj: Date | null | undefined, zona: string): string | null {
  return reloj ? aFechaHoraIso(reloj, zona) : null;
}

export function aFechaONull(reloj: Date | null | undefined): string | null {
  return reloj ? aFecha(reloj) : null;
}

/** Fecha 'AAAA-MM-DD' de un parámetro de tool → reloj (medianoche) para pasar a un SP. */
export function relojDesdeFechaParametro(fecha: string): Date {
  return relojDesdeTexto(fecha);
}

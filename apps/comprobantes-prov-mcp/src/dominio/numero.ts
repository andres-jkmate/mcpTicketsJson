/**
 * Número de comprobante argentino: letra, punto de venta (hasta 4 dígitos) y número (hasta 8).
 * Se acepta como lo dice el usuario (`A1 135`, `A 0001 00000135`, `A-1-135`, `A0001-00000135`) y
 * se normaliza a `L-PPPP-NNNNNNNN`, que es como lo graba JK3.
 */

export type Letra = 'A' | 'B' | 'C';

export type NumeroNormalizado = { ok: true; numero: string; letra: Letra } | { ok: false; motivo: string };

const PATRON = /^([a-z])\s*-?\s*(\d+)\s*[-\s]\s*(\d+)$/i;
export const PATRON_NORMALIZADO = /^[ABC]-\d{4}-\d{8}$/;

export function normalizarNumero(texto: string): NumeroNormalizado {
  const m = PATRON.exec(texto.trim());
  if (!m) return { ok: false, motivo: 'No se reconoce el número: indicá letra, punto de venta y número (ej.: A 1 135)' };
  const [, letra, puntoVenta, numero] = m as unknown as [string, string, string, string];
  const l = letra.toUpperCase();
  if (l !== 'A' && l !== 'B' && l !== 'C') return { ok: false, motivo: `La letra ${l} no es válida: tiene que ser A, B o C` };
  if (puntoVenta.length > 4) return { ok: false, motivo: 'El punto de venta tiene más de 4 dígitos' };
  if (numero.length > 8) return { ok: false, motivo: 'El número tiene más de 8 dígitos' };
  if (/^0+$/.test(numero)) return { ok: false, motivo: 'Falta el número del comprobante' };
  return { ok: true, numero: `${l}-${puntoVenta.padStart(4, '0')}-${numero.padStart(8, '0')}`, letra: l };
}

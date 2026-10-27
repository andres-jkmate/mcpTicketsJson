/**
 * Número de un movimiento de fondos: JK3 lo graba como `L-PPPP-NNNNNNNN` (letra, punto de venta y
 * número), pero el usuario lo dice abreviado (`X1 9463`, `X-1-9463`, `X 9463` o solo `9463`). Se
 * interpreta y se arma el patrón `LIKE` de 15 caracteres: lo que no se dijo queda como comodín.
 */

export type NumeroBuscado =
  | {
      ok: true;
      /** Patrón para `NRO_COMPROBANTE LIKE`, con `_` donde falta la letra o el punto de venta. */
      patron: string;
      /** El mismo patrón como se muestra en `criterio.numero`, con `?` en lugar de `_`. */
      numero: string;
    }
  | { ok: false; motivo: string };

const COMPLETO = /^([a-z])\s*-?\s*(\d+)\s*[-\s]\s*(\d+)$/i;
const SIN_LETRA = /^(\d+)\s*[-\s]\s*(\d+)$/;
const LETRA_Y_NUMERO = /^([a-z])\s*-?\s*(\d+)$/i;
const SOLO_NUMERO = /^(\d+)$/;

const NO_SE_RECONOCE = 'No se reconoce el número: indicá letra, punto de venta y número (ej.: X 1 9463) o solo el número (ej.: 9463)';

export function interpretarNumero(texto: string): NumeroBuscado {
  const t = texto.trim();
  let letra = '_';
  let puntoVenta: string | null = null;
  let numero: string;

  let m: RegExpExecArray | null;
  if ((m = COMPLETO.exec(t))) [, letra, puntoVenta, numero] = m as unknown as [string, string, string, string];
  else if ((m = SIN_LETRA.exec(t))) [, puntoVenta, numero] = m as unknown as [string, string, string];
  else if ((m = LETRA_Y_NUMERO.exec(t))) [, letra, numero] = m as unknown as [string, string, string];
  else if ((m = SOLO_NUMERO.exec(t))) [, numero] = m as unknown as [string, string];
  else return { ok: false, motivo: NO_SE_RECONOCE };

  if (puntoVenta !== null && puntoVenta.length > 4) return { ok: false, motivo: 'El punto de venta tiene más de 4 dígitos' };
  if (numero.length > 8) return { ok: false, motivo: 'El número tiene más de 8 dígitos' };
  if (/^0+$/.test(numero)) return { ok: false, motivo: 'Falta el número del comprobante' };

  const patron = `${letra.toUpperCase()}-${puntoVenta === null ? '____' : puntoVenta.padStart(4, '0')}-${numero.padStart(8, '0')}`;
  return { ok: true, patron, numero: patron.replaceAll('_', '?') };
}

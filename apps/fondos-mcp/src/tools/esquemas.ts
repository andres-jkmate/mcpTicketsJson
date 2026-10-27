/** Valores y esquemas JSON compartidos por las dos tools. */

export const CLASES = ['pago', 'cobro', 'deposito', 'varios', 'reversion', 'otros'] as const;
export type Clase = (typeof CLASES)[number];

export const ESTADOS = ['vigente', 'revertido', 'anulado'] as const;
export type Estado = (typeof ESTADOS)[number];

export const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function esFechaValida(texto: string): boolean {
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(texto);
}

export const jsonFecha = { type: 'string', format: 'date', pattern: PATRON_FECHA.source } as const;
export const jsonFechaONull = { ...jsonFecha, type: ['string', 'null'] } as const;
export const jsonTextoONull = { type: ['string', 'null'] } as const;
export const jsonEnteroONull = { type: ['integer', 'null'] } as const;
export const jsonNumeroONull = { type: ['number', 'null'] } as const;

export const ANNOTATIONS_CONSULTA = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

/** Texto de un CHAR/VARCHAR recortado; vacío o NULL → ''. */
export const texto = (valor: string | null | undefined) => valor?.trim() ?? '';

/** Redondeo a milésimos (NUMERIC(18,3)) para sumar importes sin arrastrar error de coma flotante. */
export const milesimos = (valor: number) => Math.round(valor * 1000) / 1000;

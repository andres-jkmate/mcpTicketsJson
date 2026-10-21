/** Conversiones de valores de Firebird a los tipos del contrato (booleanos reales, personas, textos). */

export interface Persona {
  id: number;
  nombre: string;
}

/** Mismo shape que Persona, para catálogos (cliente, proceso, tipo de tarea). */
export type RefNombre = Persona;

/** SMALLINT 0/1 (o NULL) → boolean. NULL cuenta como false. */
export function aBooleano(valor: number | null | undefined): boolean {
  return valor === 1;
}

/**
 * `{ id, nombre }` o null si no hay id. Si falta el nombre se usa el id como texto, para que
 * `nombre` nunca quede vacío en el contrato.
 */
export function aPersona(id: number | null | undefined, nombre: string | null | undefined): Persona | null {
  if (id === null || id === undefined) return null;
  const limpio = nombre?.trim();
  return { id, nombre: limpio ? limpio : String(id) };
}

export const aRefNombre = aPersona;

/** Texto recortado; vacío o NULL → null. */
export function aTextoONull(valor: string | null | undefined): string | null {
  const limpio = valor?.trim();
  return limpio ? limpio : null;
}

/**
 * Devuelve una copia sin las claves cuyo valor es null o undefined. Solo se usa en el historial,
 * donde `destinatario`, `evento`, `resultado` y `respondeA` se omiten cuando no aplican.
 */
export function omitirNulos<T extends Record<string, unknown>>(objeto: T): Partial<T> {
  return Object.fromEntries(Object.entries(objeto).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;
}

const ENTIDADES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  uuml: 'ü',
  Uuml: 'Ü',
  iexcl: '¡',
  iquest: '¿',
};

function decodificarEntidades(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (original, cuerpo: string) => {
    if (cuerpo[0] === '#') {
      const codigo = cuerpo[1] === 'x' || cuerpo[1] === 'X' ? parseInt(cuerpo.slice(2), 16) : parseInt(cuerpo.slice(1), 10);
      return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : original;
    }
    return ENTIDADES[cuerpo] ?? original;
  });
}

/**
 * HTML de un mensaje → texto plano. `<br>` y los cierres de bloque (`</p>`, `</div>`, `</li>`)
 * pasan a salto de línea; el resto de las etiquetas se quita; las entidades se decodifican.
 */
export function htmlATexto(html: string | null | undefined): string {
  if (!html) return '';
  const texto = html
    .replace(/\r\n?/g, '\n')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  return decodificarEntidades(texto)
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

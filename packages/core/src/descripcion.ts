/**
 * Plantilla de descripción de tools: cuatro partes rotuladas, en este orden y cada una al
 * comienzo de una línea.
 *
 *   Qué hace: …
 *   Cuándo usarla: …
 *   Parámetros: … (ej.: …)        o  "Parámetros: ninguno." si la tool no recibe parámetros
 *   Qué NO hacer: …                (con la tool a usar en su lugar, si existe)
 */
export const PARTES_DESCRIPCION = ['Qué hace', 'Cuándo usarla', 'Parámetros', 'Qué NO hacer'] as const;

const EJEMPLO = /\bej\.?:|por ejemplo/i;
const SIN_PARAMETROS = /^ninguno\.?$/i;

function posicion(texto: string, parte: string): number {
  return new RegExp(`^${parte}:`, 'm').exec(texto)?.index ?? -1;
}

/**
 * Verifica una descripción contra la plantilla. Devuelve los problemas encontrados (partes que
 * faltan, partes fuera de orden y falta de ejemplo en "Parámetros"); vacío si cumple.
 */
export function verificarDescripcion(texto: string): string[] {
  const problemas: string[] = [];
  const posiciones = PARTES_DESCRIPCION.map((parte) => ({ parte, inicio: posicion(texto, parte) }));

  for (const { parte, inicio } of posiciones) if (inicio < 0) problemas.push(`falta "${parte}"`);

  const presentes = posiciones.filter((p) => p.inicio >= 0);
  presentes.forEach((p, i) => {
    const anterior = presentes[i - 1];
    if (anterior && p.inicio < anterior.inicio) problemas.push(`"${p.parte}" está antes de "${anterior.parte}"`);
  });

  const parametros = posiciones[2]!;
  if (parametros.inicio >= 0) {
    const desde = parametros.inicio + `${parametros.parte}:`.length;
    const siguientes = posiciones.map((p) => p.inicio).filter((i) => i > parametros.inicio);
    const contenido = texto.slice(desde, siguientes.length ? Math.min(...siguientes) : undefined).trim();
    if (!SIN_PARAMETROS.test(contenido) && !EJEMPLO.test(contenido)) {
      problemas.push('falta un ejemplo en "Parámetros" (ej.: …)');
    }
  }
  return problemas;
}

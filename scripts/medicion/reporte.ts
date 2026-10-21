import type { MedicionCaso } from './estrategias.js';

/** Reducción porcentual de v1 a v2 (positiva = v2 usa menos). null si no hay base de comparación. */
export function reduccion(v1: number, v2: number | null): number | null {
  if (v2 === null || v1 <= 0) return null;
  return Math.round(((v1 - v2) / v1) * 1000) / 10;
}

export interface FilaReporte {
  tipo: MedicionCaso['tipo'];
  caso: string;
  llamadasV1: number;
  llamadasV2: number;
  caracteresV1: number;
  caracteresTextoV2: number;
  caracteresEstructuradoV2: number | null;
  reduccionTexto: number | null;
  reduccionEstructurado: number | null;
  erroresV1: number;
  erroresV2: number;
}

export interface Reporte {
  fecha: string;
  filas: FilaReporte[];
  totales: Omit<FilaReporte, 'tipo' | 'caso'>;
  totalesPorTipo: Record<MedicionCaso['tipo'], Omit<FilaReporte, 'tipo' | 'caso'>>;
}

function fila(m: MedicionCaso): FilaReporte {
  return {
    tipo: m.tipo,
    caso: m.caso,
    llamadasV1: m.v1.llamadas,
    llamadasV2: m.v2.llamadas,
    caracteresV1: m.v1.caracteresTexto,
    caracteresTextoV2: m.v2.caracteresTexto,
    caracteresEstructuradoV2: m.v2.caracteresEstructurado,
    reduccionTexto: reduccion(m.v1.caracteresTexto, m.v2.caracteresTexto),
    reduccionEstructurado: reduccion(m.v1.caracteresTexto, m.v2.caracteresEstructurado),
    erroresV1: m.v1.errores,
    erroresV2: m.v2.errores,
  };
}

function totalizar(filas: FilaReporte[]): Omit<FilaReporte, 'tipo' | 'caso'> {
  const suma = (f: (x: FilaReporte) => number) => filas.reduce((s, x) => s + f(x), 0);
  const conEstructurado = filas.every((f) => f.caracteresEstructuradoV2 !== null);
  const caracteresV1 = suma((f) => f.caracteresV1);
  const caracteresTextoV2 = suma((f) => f.caracteresTextoV2);
  const caracteresEstructuradoV2 = conEstructurado && filas.length ? suma((f) => f.caracteresEstructuradoV2 ?? 0) : null;
  return {
    llamadasV1: suma((f) => f.llamadasV1),
    llamadasV2: suma((f) => f.llamadasV2),
    caracteresV1,
    caracteresTextoV2,
    caracteresEstructuradoV2,
    reduccionTexto: reduccion(caracteresV1, caracteresTextoV2),
    reduccionEstructurado: reduccion(caracteresV1, caracteresEstructuradoV2),
    erroresV1: suma((f) => f.erroresV1),
    erroresV2: suma((f) => f.erroresV2),
  };
}

/** Arma el reporte solo con números y nombres de caso: nunca textos de tickets ni tokens. */
export function armarReporte(mediciones: MedicionCaso[], fecha: Date): Reporte {
  const filas = mediciones.map(fila);
  return {
    fecha: fecha.toISOString(),
    filas,
    totales: totalizar(filas),
    totalesPorTipo: {
      contexto: totalizar(filas.filter((f) => f.tipo === 'contexto')),
      listado: totalizar(filas.filter((f) => f.tipo === 'listado')),
    },
  };
}

const pct = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('es-AR')} %`);
const num = (v: number | null) => (v === null ? '—' : v.toLocaleString('es-AR'));

function lineaTabla(nombre: string, f: Omit<FilaReporte, 'tipo' | 'caso'>): string {
  const errores = f.erroresV1 || f.erroresV2 ? ` ⚠ errores v1/v2: ${f.erroresV1}/${f.erroresV2}` : '';
  return `| ${nombre}${errores} | ${f.llamadasV1} | ${f.llamadasV2} | ${num(f.caracteresV1)} | ${num(f.caracteresTextoV2)} | ${pct(f.reduccionTexto)} | ${num(f.caracteresEstructuradoV2)} | ${pct(f.reduccionEstructurado)} |`;
}

export function aMarkdown(r: Reporte): string {
  const encabezado =
    '| Caso | Llamadas v1 | Llamadas v2 | Caracteres v1 | Texto v2 | Reducción texto | Estructurado v2 | Reducción estructurado |\n' +
    '|---|---:|---:|---:|---:|---:|---:|---:|';
  return [
    `# Medición de eficiencia v1 contra v2`,
    '',
    `Fecha: ${r.fecha}`,
    '',
    'Caracteres de `content[].text` en ambas versiones; en v2 además los de `structuredContent` serializado (un cliente lee uno u otro). Reducción = (v1 − v2) / v1.',
    '',
    encabezado,
    ...r.filas.map((f) => lineaTabla(f.caso, f)),
    lineaTabla('**Total contexto**', r.totalesPorTipo.contexto),
    lineaTabla('**Total listados**', r.totalesPorTipo.listado),
    lineaTabla('**Total**', r.totales),
    '',
  ].join('\n');
}

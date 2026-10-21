/**
 * Registro completo de una ejecución en medicion/agente/corridas/<id>.jsonl (spec "Registro por
 * turno"). Contiene textos (pedidos, respuestas y argumentos), por eso esa carpeta está en
 * .gitignore. El reporte se regenera solo desde estos archivos, sin volver a llamar al modelo.
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { IdCaso } from './casos.js';
import { CARPETA_AGENTE, type Version } from './configuracion.js';
import type { TamanoTools } from './herramientas.js';
import type { ResultadoCorrida } from './loop.js';

export const CARPETA_CORRIDAS = join(CARPETA_AGENTE, 'corridas');

export interface Verificacion {
  exito: boolean;
  motivo?: string;
}

export interface LineaEjecucion {
  tipo: 'ejecucion';
  id: string;
  fecha: string;
  modelo: string;
  effort: string;
  maxTokens: number;
  repeticiones: number;
  casos: IdCaso[];
  versiones: Version[];
  topeUsd: number | null;
  tools: Partial<Record<Version, TamanoTools>>;
}

export interface LineaCorrida {
  tipo: 'corrida';
  caso: IdCaso;
  version: Version;
  repeticion: number;
  /** Posición en el orden de ejecución (D9). */
  orden: number;
  modelo: string;
  effort: string;
  system: string;
  pedido: string;
  resultado: ResultadoCorrida;
  verificacion: Verificacion;
}

export interface LineaFin {
  tipo: 'fin';
  fecha: string;
  cortadaPorTope: boolean;
}

export type LineaRegistro = LineaEjecucion | LineaCorrida | LineaFin;

export class Registro {
  constructor(readonly archivo: string) {}

  static nuevo(id: string): Registro {
    return new Registro(join(CARPETA_CORRIDAS, `${id}.jsonl`));
  }

  async escribir(linea: LineaRegistro): Promise<void> {
    await mkdir(dirname(this.archivo), { recursive: true });
    await appendFile(this.archivo, `${JSON.stringify(linea)}\n`);
  }
}

export interface RegistrosLeidos {
  ejecucion: LineaEjecucion;
  corridas: LineaCorrida[];
  fin: LineaFin | null;
}

export async function leerRegistro(archivo: string): Promise<RegistrosLeidos> {
  const lineas = (await readFile(archivo, 'utf8'))
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as LineaRegistro);
  const ejecucion = lineas.find((l): l is LineaEjecucion => l.tipo === 'ejecucion');
  if (!ejecucion) throw new Error(`${archivo} no tiene la línea de ejecución`);
  return {
    ejecucion,
    corridas: lineas.filter((l): l is LineaCorrida => l.tipo === 'corrida'),
    fin: lineas.find((l): l is LineaFin => l.tipo === 'fin') ?? null,
  };
}

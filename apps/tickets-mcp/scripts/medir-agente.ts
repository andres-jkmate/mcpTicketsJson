/**
 * Mide tiempo, tokens y costo de un agente real (Claude Opus 5.5) resolviendo el conjunto fijo de
 * medicion/agente/casos.json contra la v1 y la v2 (change medir-agente-v1-v2).
 *
 *   ANTHROPIC_API_KEY (o un perfil de `ant auth login`)   credenciales de la API
 *   MEDICION_URL_V1, MEDICION_TOKEN_V1                    endpoint y bearer de la v1
 *   MCP_COD_USUARIO y FIREBIRD_*                          v2 (stdio) y verdad de referencia (solo lectura)
 *
 * Uso: npm run medir:agente -- [--repeticiones N] [--casos a,b] [--versiones v1,v2] [--tope-usd X]
 *      npm run medir:agente -- --solo-reporte [medicion/agente/corridas/<id>.jsonl]
 *
 * Registros completos (con textos) → medicion/agente/corridas/<id>.jsonl (fuera de git)
 * Reporte (solo números)          → medicion/agente/resultados/<id>.{json,md}
 * Ninguna tool de escritura llega a los servidores: se interceptan (design D6).
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';
import { cargarConfig } from '../src/config.js';
import { abrirBase, obtenerReferencia, type VerdadReferencia } from './agente/base.js';
import { cargarCasos, CASOS_OBLIGATORIOS, type Caso, type IdCaso } from './agente/casos.js';
import { conectarV1, conectarV2, type Conexion } from './agente/conexion.js';
import {
  CARPETA_AGENTE,
  cargarListasTools,
  cargarPrecios,
  leerJson,
  precioDe,
  VERSIONES,
  type PrecioModelo,
  type Precios,
  type Version,
} from './agente/configuracion.js';
import { aToolsModelo, medirTools, type TamanoTools, type ToolMcp } from './agente/herramientas.js';
import { cargarPlantillas, Interceptor, type EjecucionTool, type ResultadoTool } from './agente/interceptor.js';
import { correrAgente, EFFORT, MAX_TOKENS, MODELO, promptSistema, type ClienteModelo } from './agente/loop.js';
import { CARPETA_CORRIDAS, leerRegistro, Registro, type LineaCorrida, type LineaRegistro } from './agente/registro.js';
import { aMarkdown, armarReporte, costoUso } from './agente/reporte.js';
import { cargarEscrituraV2, Validador } from './agente/validacion.js';
import { verificar } from './agente/verificacion.js';

const CARPETA_RESULTADOS = join(CARPETA_AGENTE, 'resultados');

// ---------------------------------------------------------------- argumentos

export interface Argumentos {
  repeticiones?: number;
  casos?: IdCaso[];
  versiones: Version[];
  topeUsd: number | null;
  /** true = el último registro; string = ese archivo. */
  soloReporte: string | true | null;
}

export function leerArgumentos(argv: string[]): Argumentos {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      repeticiones: { type: 'string' },
      casos: { type: 'string' },
      versiones: { type: 'string' },
      'tope-usd': { type: 'string' },
      'solo-reporte': { type: 'boolean' },
    },
  });
  const numero = (nombre: string, v: string | undefined, entero: boolean) => {
    if (v === undefined) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0 || (entero && !Number.isInteger(n))) throw new Error(`--${nombre} inválido: ${v}`);
    return n;
  };
  const lista = <T extends string>(nombre: string, v: string | undefined, validos: readonly T[]): T[] | undefined => {
    if (v === undefined) return undefined;
    const items = v.split(',').map((x) => x.trim()).filter(Boolean);
    const invalidos = items.filter((x) => !validos.includes(x as T));
    if (invalidos.length || !items.length) throw new Error(`--${nombre} inválido: ${v} (valores posibles: ${validos.join(', ')})`);
    return items as T[];
  };
  return {
    repeticiones: numero('repeticiones', values.repeticiones, true),
    casos: lista('casos', values.casos, CASOS_OBLIGATORIOS),
    versiones: lista('versiones', values.versiones, VERSIONES) ?? [...VERSIONES],
    topeUsd: numero('tope-usd', values['tope-usd'], false) ?? null,
    soloReporte: values['solo-reporte'] ? (positionals[0] ?? true) : null,
  };
}

// ---------------------------------------------------------------- planificación (D9)

export interface ItemPlan {
  caso: IdCaso;
  version: Version;
  repeticion: number;
}

/**
 * Intercala casos y versiones (caso 1 v1, caso 1 v2, caso 2 v1, …) y alterna qué versión va
 * primero en cada repetición, para que el efecto del caché sea parejo.
 */
export function planificar(casos: IdCaso[], versiones: Version[], repeticiones: number): ItemPlan[] {
  const plan: ItemPlan[] = [];
  for (let repeticion = 1; repeticion <= repeticiones; repeticion++) {
    const orden = repeticion % 2 === 1 ? versiones : [...versiones].reverse();
    for (const caso of casos) for (const version of orden) plan.push({ caso, version, repeticion });
  }
  return plan;
}

// ---------------------------------------------------------------- ejecución

export interface DependenciasMedicion {
  cliente: ClienteModelo;
  precio: PrecioModelo;
  topeUsd: number | null;
  plan: ItemPlan[];
  casos: Caso[];
  tools: Partial<Record<Version, Anthropic.Tool[]>>;
  /** Un interceptor nuevo por corrida (ids ficticios y registro de escrituras propios). */
  crearInterceptor: (version: Version) => { ejecutar(tool: string, argumentos: Record<string, unknown>): Promise<EjecucionTool> };
  referencia: VerdadReferencia;
  system: string;
  maxTurnos: number;
  escribir: (linea: LineaRegistro) => Promise<void>;
  alTerminarCorrida?: (linea: LineaCorrida, costoAcumulado: number) => void;
}

export async function ejecutarMedicion(d: DependenciasMedicion): Promise<{ cortadaPorTope: boolean; costoUsd: number }> {
  let costoUsd = 0;
  const puedeSeguir = () => d.topeUsd === null || costoUsd < d.topeUsd;
  for (const [i, item] of d.plan.entries()) {
    if (!puedeSeguir()) return { cortadaPorTope: true, costoUsd };
    const caso = d.casos.find((c) => c.id === item.caso)!;
    const tools = d.tools[item.version];
    if (!tools) throw new Error(`No hay tools para ${item.version}`);
    const interceptor = d.crearInterceptor(item.version);
    const resultado = await correrAgente({
      cliente: d.cliente,
      system: d.system,
      tools,
      pedido: caso.pedido,
      maxTurnos: d.maxTurnos,
      ejecutarTool: (nombre, argumentos) => interceptor.ejecutar(nombre, argumentos),
      puedeSeguir,
      alTerminarTurno: (uso) => (costoUsd += costoUso(uso, d.precio)),
    });
    const linea: LineaCorrida = {
      tipo: 'corrida',
      caso: item.caso,
      version: item.version,
      repeticion: item.repeticion,
      orden: i + 1,
      modelo: MODELO,
      effort: EFFORT,
      system: d.system,
      pedido: caso.pedido,
      resultado,
      verificacion: verificar({
        caso,
        version: item.version,
        referencia: d.referencia,
        fin: resultado.fin,
        ...(resultado.motivo ? { motivoFin: resultado.motivo } : {}),
        respuestaFinal: resultado.respuestaFinal,
        escrituras: resultado.escrituras,
      }),
    };
    await d.escribir(linea);
    d.alTerminarCorrida?.(linea, costoUsd);
    if (resultado.fin === 'tope_costo') return { cortadaPorTope: true, costoUsd };
  }
  return { cortadaPorTope: false, costoUsd };
}

// ---------------------------------------------------------------- reporte

export async function generarReporte(archivo: string, precios: Precios, carpeta = CARPETA_RESULTADOS): Promise<{ md: string; base: string }> {
  const reporte = armarReporte(await leerRegistro(archivo), precios, new Date());
  const base = basename(archivo, '.jsonl');
  await mkdir(carpeta, { recursive: true });
  await writeFile(join(carpeta, `${base}.json`), `${JSON.stringify(reporte, null, 2)}\n`);
  const md = aMarkdown(reporte);
  await writeFile(join(carpeta, `${base}.md`), md);
  return { md, base };
}

async function ultimoRegistro(): Promise<string> {
  const archivos = (await readdir(CARPETA_CORRIDAS).catch(() => [])).filter((a) => a.endsWith('.jsonl')).sort();
  const ultimo = archivos.at(-1);
  if (!ultimo) throw new Error('No hay registros en medicion/agente/corridas/');
  return join(CARPETA_CORRIDAS, ultimo);
}

// ---------------------------------------------------------------- principal

const dos = (n: number) => String(n).padStart(2, '0');
const salida = (texto: string) => process.stdout.write(`${texto}\n`);

async function conectarVersion(version: Version): Promise<Conexion> {
  try {
    const conexion = version === 'v1' ? await conectarV1() : await conectarV2();
    return conexion;
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    if (version === 'v1') {
      throw new Error(
        `No se pudo conectar a la v1 (${detalle}). Verificá que mcp-tickets esté corriendo en MEDICION_URL_V1 y que ` +
          'MEDICION_TOKEN_V1 no haya vencido (dura 15 días; se renueva con client_credentials).',
        { cause: error },
      );
    }
    throw new Error(`No se pudo lanzar la v2 por stdio (${detalle}). Corré npm run build y revisá MCP_COD_USUARIO y FIREBIRD_*.`, { cause: error });
  }
}

async function principal() {
  const args = leerArgumentos(process.argv.slice(2));
  const precios = cargarPrecios(await leerJson('precios.json'));
  const precio = precioDe(precios, MODELO);

  if (args.soloReporte) {
    const archivo = args.soloReporte === true ? await ultimoRegistro() : resolve(args.soloReporte);
    const { md, base } = await generarReporte(archivo, precios);
    salida(`${md}\nReporte regenerado en medicion/agente/resultados/${base}.{json,md}`);
    return;
  }

  // Validaciones antes de llamar al modelo: un conjunto incompleto termina con error acá.
  const conjunto = cargarCasos(await leerJson('casos.json'));
  const listas = cargarListasTools(await leerJson('tools.json'));
  const escrituraV2 = cargarEscrituraV2(await leerJson('escritura-v2.json'));
  const casos = args.casos ? conjunto.casos.filter((c) => args.casos!.includes(c.id)) : conjunto.casos;
  const repeticiones = args.repeticiones ?? conjunto.repeticiones;
  const config = cargarConfig();

  const cliente = new Anthropic();
  const conexiones = new Map<Version, Conexion>();
  const base = abrirBase(config);
  try {
    // Comprobaciones previas: conexión a cada versión y a la API (count_tokens no consume tokens).
    const tools: Partial<Record<Version, Anthropic.Tool[]>> = {};
    const tamanos: Partial<Record<Version, TamanoTools>> = {};
    for (const version of args.versiones) {
      const conexion = await conectarVersion(version);
      conexiones.set(version, conexion);
      const publicadas = (await conexion.cliente.listTools()).tools as ToolMcp[];
      const conocidas = [...listas[version].lectura, ...listas[version].escritura];
      const sinClasificar = publicadas.map((t) => t.name).filter((n) => !conocidas.includes(n));
      if (sinClasificar.length) salida(`Aviso: ${version} publica tools que no están en tools.json y se interceptan: ${sinClasificar.join(', ')}`);
      tools[version] = aToolsModelo(publicadas, version === 'v2' ? escrituraV2 : []);
      try {
        tamanos[version] = await medirTools(cliente, MODELO, tools[version]!);
      } catch (error) {
        throw new Error(`No se pudo usar la API de Anthropic (${error instanceof Error ? error.message : String(error)}). Configurá ANTHROPIC_API_KEY o ejecutá ant auth login.`, { cause: error });
      }
      salida(`${version}: ${tamanos[version]!.cantidad} tools, ${tamanos[version]!.caracteres} caracteres, ${tamanos[version]!.tokens} tokens`);
    }

    const referencia = await obtenerReferencia(base, casos, config.MCP_COD_USUARIO);
    const schemas = new Map<Version, Map<string, object>>();
    const plantillas = new Map<Version, Awaited<ReturnType<typeof cargarPlantillas>>>();
    for (const version of args.versiones) {
      schemas.set(version, new Map(tools[version]!.map((t) => [t.name, t.input_schema as object])));
      plantillas.set(version, await cargarPlantillas(version, [...listas[version].escritura]));
    }
    const validador = new Validador();

    const ahora = new Date();
    const hoy = `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`;
    const id = `${hoy}-${dos(ahora.getHours())}${dos(ahora.getMinutes())}`;
    const registro = Registro.nuevo(id);
    const plan = planificar(
      casos.map((c) => c.id),
      args.versiones,
      repeticiones,
    );
    await registro.escribir({
      tipo: 'ejecucion',
      id,
      fecha: ahora.toISOString(),
      modelo: MODELO,
      effort: EFFORT,
      maxTokens: MAX_TOKENS,
      repeticiones,
      casos: casos.map((c) => c.id),
      versiones: args.versiones,
      topeUsd: args.topeUsd,
      tools: tamanos,
    });
    salida(`Ejecución ${id}: ${plan.length} corridas${args.topeUsd !== null ? `, tope US$ ${args.topeUsd}` : ''}.`);

    const { cortadaPorTope, costoUsd } = await ejecutarMedicion({
      cliente,
      precio,
      topeUsd: args.topeUsd,
      plan,
      casos,
      tools,
      referencia,
      system: promptSistema(hoy),
      maxTurnos: conjunto.maxTurnos,
      escribir: (linea) => registro.escribir(linea),
      crearInterceptor: (version) =>
        new Interceptor({
          version,
          listas,
          schemas: schemas.get(version)!,
          plantillas: plantillas.get(version)!,
          consultas: base,
          validador,
          codDesarrollador: referencia.codDesarrollador,
          reenviar: async (tool, argumentos) => (await conexiones.get(version)!.llamarCrudo(tool, argumentos)) as ResultadoTool,
        }),
      alTerminarCorrida: (l, acumulado) =>
        salida(
          `[${l.orden}/${plan.length}] ${l.caso} ${l.version} #${l.repeticion}: ${l.verificacion.exito ? 'éxito' : `falla (${l.verificacion.motivo})`}, ` +
            `${l.resultado.turnos.length} turnos, ${(l.resultado.tiempoTotalMs / 1000).toFixed(1)} s, acumulado US$ ${acumulado.toFixed(4)}`,
        ),
    });
    await registro.escribir({ tipo: 'fin', fecha: new Date().toISOString(), cortadaPorTope });
    if (cortadaPorTope) salida(`Se alcanzó el tope de costo (US$ ${costoUsd.toFixed(4)}): no se enviaron más requests.`);

    const { md, base: nombre } = await generarReporte(registro.archivo, precios);
    salida(`\n${md}\nReporte en medicion/agente/resultados/${nombre}.{json,md} · registro en medicion/agente/corridas/${nombre}.jsonl`);
  } finally {
    await Promise.allSettled([...[...conexiones.values()].map((c) => c.cerrar()), base.cerrar()]);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

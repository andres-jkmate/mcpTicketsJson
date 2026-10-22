/**
 * Estima, sin llamar a la API de Anthropic, los tokens y el costo de los casos de
 * medicion/agente/casos.json con la v1 y la v2 (design D12). No necesita ANTHROPIC_API_KEY.
 *
 *   MEDICION_URL_V1, MEDICION_TOKEN_V1   endpoint y bearer de la v1
 *   MCP_COD_USUARIO y FIREBIRD_*         v2 (stdio) y verificaciones de las escrituras (solo lectura)
 *
 * Uso: npm run estimar:agente -- [--casos a,b] [--versiones v1,v2] [--razon 3.5]
 *
 * Reporte (solo números) → medicion/agente/estimaciones/AAAA-MM-DD-HHmm.{json,md}
 * Las lecturas del guion van a los servidores reales; las escrituras se interceptan (design D6).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { cargarConfig } from '../src/config.js';
import { abrirBase } from './agente/base.js';
import { cargarCasos, CASOS_OBLIGATORIOS, type IdCaso } from './agente/casos.js';
import { conectarV1, conectarV2, type Conexion } from './agente/conexion.js';
import { CARPETA_AGENTE, cargarListasTools, cargarPrecios, leerJson, precioDe, VERSIONES, type Version } from './agente/configuracion.js';
import { simularGuion } from './agente/estimador.js';
import { cargarEstimacion, cargarGuiones } from './agente/guiones.js';
import { aToolsModelo, type ToolMcp } from './agente/herramientas.js';
import { cargarPlantillas, Interceptor, type ResultadoTool } from './agente/interceptor.js';
import { MODELO, promptSistema } from './agente/loop.js';
import { aMarkdownEstimacion, armarReporteEstimacion, type MedicionEstimada } from './agente/reporte-estimacion.js';
import { cargarEscrituraV2, Validador } from './agente/validacion.js';

const CARPETA_ESTIMACIONES = join(CARPETA_AGENTE, 'estimaciones');

export interface ArgumentosEstimacion {
  casos?: IdCaso[];
  versiones: Version[];
  razon?: number;
}

export function leerArgumentosEstimacion(argv: string[]): ArgumentosEstimacion {
  const { values } = parseArgs({
    args: argv,
    options: { casos: { type: 'string' }, versiones: { type: 'string' }, razon: { type: 'string' } },
  });
  const lista = <T extends string>(nombre: string, v: string | undefined, validos: readonly T[]): T[] | undefined => {
    if (v === undefined) return undefined;
    const items = v.split(',').map((x) => x.trim()).filter(Boolean);
    const invalidos = items.filter((x) => !validos.includes(x as T));
    if (invalidos.length || !items.length) throw new Error(`--${nombre} inválido: ${v} (valores posibles: ${validos.join(', ')})`);
    return items as T[];
  };
  let razon: number | undefined;
  if (values.razon !== undefined) {
    razon = Number(values.razon.replace(',', '.'));
    if (!Number.isFinite(razon) || razon <= 0) throw new Error(`--razon inválido: ${values.razon}`);
  }
  return {
    casos: lista('casos', values.casos, CASOS_OBLIGATORIOS),
    versiones: lista('versiones', values.versiones, VERSIONES) ?? [...VERSIONES],
    ...(razon !== undefined ? { razon } : {}),
  };
}

const dos = (n: number) => String(n).padStart(2, '0');
const salida = (texto: string) => process.stdout.write(`${texto}\n`);

async function principal() {
  const args = leerArgumentosEstimacion(process.argv.slice(2));
  const conjunto = cargarCasos(await leerJson('casos.json'));
  const listas = cargarListasTools(await leerJson('tools.json'));
  const escrituraV2 = cargarEscrituraV2(await leerJson('escritura-v2.json'));
  const guiones = cargarGuiones(await leerJson('guiones.json'), listas);
  const cargados = cargarEstimacion(await leerJson('estimacion.json'));
  const supuestos = args.razon ? { ...cargados, razonCaracteresPorToken: args.razon } : cargados;
  const precio = precioDe(cargarPrecios(await leerJson('precios.json')), MODELO);
  const casos = args.casos ? conjunto.casos.filter((c) => args.casos!.includes(c.id)) : conjunto.casos;
  const config = cargarConfig();

  const ahora = new Date();
  const hoy = `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`;
  const system = promptSistema(hoy);
  const conexiones = new Map<Version, Conexion>();
  const base = abrirBase(config);
  try {
    const codDesarrollador = await base.acceso.codDesarrolladorDeUsuario(config.MCP_COD_USUARIO);
    if (codDesarrollador === null) throw new Error(`El usuario ${config.MCP_COD_USUARIO} no es desarrollador`);
    const validador = new Validador();
    const mediciones: MedicionEstimada[] = [];

    for (const version of args.versiones) {
      const conexion = version === 'v1' ? await conectarV1() : await conectarV2();
      conexiones.set(version, conexion);
      const publicadas = (await conexion.cliente.listTools()).tools as ToolMcp[];
      const tools = aToolsModelo(publicadas, version === 'v2' ? escrituraV2 : []);
      const schemas = new Map(tools.map((t) => [t.name, t.input_schema as object]));
      const plantillas = await cargarPlantillas(version, [...listas[version].escritura]);
      salida(`${version}: ${tools.length} tools publicadas al modelo`);

      for (const caso of casos) {
        const interceptor = new Interceptor({
          version,
          listas,
          schemas,
          plantillas,
          consultas: base,
          validador,
          codDesarrollador,
          reenviar: async (tool, argumentos) => (await conexion.llamarCrudo(tool, argumentos)) as ResultadoTool,
        });
        let conversacion;
        try {
          conversacion = await simularGuion({
            guion: guiones[caso.id][version],
            tools,
            system,
            pedido: caso.pedido,
            hoy,
            ejecutarTool: (tool, argumentos) => interceptor.ejecutar(tool, argumentos),
          });
        } catch (error) {
          throw new Error(`${caso.id} con ${version}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        }
        const conError = conversacion.turnos.flatMap((t) => t.llamadas).filter((l) => l.error);
        if (conError.length) salida(`Aviso: ${caso.id} con ${version}: ${conError.map((l) => l.tool).join(', ')} respondió con error.`);
        mediciones.push({ caso: caso.id, version, conversacion });
      }
    }

    const reporte = armarReporteEstimacion(mediciones, supuestos, MODELO, precio, ahora);
    const id = `${hoy}-${dos(ahora.getHours())}${dos(ahora.getMinutes())}`;
    await mkdir(CARPETA_ESTIMACIONES, { recursive: true });
    await writeFile(join(CARPETA_ESTIMACIONES, `${id}.json`), `${JSON.stringify(reporte, null, 2)}\n`);
    const md = aMarkdownEstimacion(reporte);
    await writeFile(join(CARPETA_ESTIMACIONES, `${id}.md`), md);
    salida(`\n${md}\nEstimación en medicion/agente/estimaciones/${id}.{json,md}`);
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

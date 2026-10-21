/**
 * Mide caracteres y cantidad de llamadas de la v1 (tickets-jkmate-mcp) contra la v2 sobre el
 * conjunto fijo de medicion/tickets.json (design D9).
 *
 *   MEDICION_URL_V1, MEDICION_TOKEN_V1   endpoint y bearer de la v1 (Streamable HTTP)
 *   La v2 se lanza por stdio (dist/index.js) con MCP_COD_USUARIO y FIREBIRD_* del entorno.
 *
 * Uso: npm run medir   →   medicion/resultados/AAAA-MM-DD-HHmm.{json,md}
 * Los tokens y los textos de los tickets nunca se escriben en el reporte.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RAIZ, conectarV1, conectarV2 } from './agente/conexion.js';
import { cargarConjunto } from './medicion/conjunto.js';
import { medirContexto, medirListado, type MedicionCaso } from './medicion/estrategias.js';
import { aMarkdown, armarReporte } from './medicion/reporte.js';

const dos = (n: number) => String(n).padStart(2, '0');

async function principal() {
  const conjunto = cargarConjunto(JSON.parse(await readFile(join(RAIZ, 'medicion', 'tickets.json'), 'utf8')));
  const v1 = await conectarV1();
  const v2 = await conectarV2();

  const ahora = new Date();
  const hoy = `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`;
  const mediciones: MedicionCaso[] = [];
  try {
    for (const ticket of conjunto.tickets) mediciones.push(await medirContexto(v1.llamar, v2.llamar, ticket, hoy));
    for (const caso of conjunto.listados) mediciones.push(await medirListado(v1.llamar, v2.llamar, caso));
  } finally {
    await Promise.allSettled([v1.cerrar(), v2.cerrar()]);
  }

  const reporte = armarReporte(mediciones, ahora);
  const carpeta = join(RAIZ, 'medicion', 'resultados');
  const base = `${hoy}-${dos(ahora.getHours())}${dos(ahora.getMinutes())}`;
  await mkdir(carpeta, { recursive: true });
  await writeFile(join(carpeta, `${base}.json`), `${JSON.stringify(reporte, null, 2)}\n`);
  const markdown = aMarkdown(reporte);
  await writeFile(join(carpeta, `${base}.md`), markdown);
  process.stdout.write(`${markdown}\nReporte en medicion/resultados/${base}.{json,md}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

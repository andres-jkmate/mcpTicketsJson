/**
 * Guarda el JSON de `tools/list` del servidor de tickets, levantado en memoria sin base (con el
 * acceso simulado de los tests). Sirve de snapshot del contrato publicado: un test compara el
 * `tools/list` actual con este archivo.
 *
 * Uso: npx tsx scripts/guardar-tools-list.ts <ruta-de-salida.json>
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { crearTools } from '../src/tools/index.js';
import { accesoSimulado, conectarCliente } from '../test/apoyo.js';

async function principal() {
  const destino = process.argv[2];
  if (!destino) throw new Error('Falta la ruta de salida');
  const { acceso } = accesoSimulado({});
  const { cliente, servidor } = await conectarCliente(crearTools({ acceso, zonaHoraria: 'America/Argentina/Buenos_Aires' }));
  try {
    const { tools } = await cliente.listTools();
    await writeFile(resolve(destino), `${JSON.stringify(tools, null, 2)}\n`);
    process.stdout.write(`${tools.length} tools guardadas en ${resolve(destino)}\n`);
  } finally {
    await cliente.close();
    await servidor.close();
  }
}

principal().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { crearLogger, type Sesion } from '@mcp-jkmate/core';
import { crearAccesoFirebird } from '@mcp-jkmate/firebird';
import { cargarConfig } from './config.js';
import { crearServidor, NOMBRE_SERVIDOR } from './servidor.js';
import { crearTools } from './tools/index.js';

/*
 * Servidor MCP local por stdio (Claude Desktop lo lanza como proceso hijo). stdout es el canal
 * del protocolo: todo log va a stderr.
 */
async function principal() {
  const config = cargarConfig();
  const logger = crearLogger({ ...config, app: NOMBRE_SERVIDOR });
  const acceso = crearAccesoFirebird(config);
  // Un proceso = un usuario: la identidad sale de la configuración, nunca de un parámetro.
  const sesion: Sesion = { codUsuario: config.MCP_COD_USUARIO };

  const servidor = crearServidor(crearTools({ acceso }), { logger, sesion });

  async function apagar() {
    await servidor.close().catch(() => undefined);
    await acceso.cerrar().catch(() => undefined);
    logger.flush();
    process.exit(0);
  }
  process.stdin.on('close', () => void apagar());
  process.on('SIGINT', () => void apagar());
  process.on('SIGTERM', () => void apagar());

  await servidor.connect(new StdioServerTransport());
  logger.info({ codUsuario: sesion.codUsuario }, `${NOMBRE_SERVIDOR} listo (stdio)`);
}

principal().catch((error: unknown) => {
  process.stderr.write(`${NOMBRE_SERVIDOR} no pudo arrancar: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

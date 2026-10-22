import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { crearLogger } from '@mcp-jkmate/core';
import { crearAccesoFirebird } from '@mcp-jkmate/firebird';
import { cargarConfig } from './config.js';
import { codDesarrolladorDeUsuario } from './db/usuarios.js';
import { crearServidorTickets, NOMBRE_SERVIDOR } from './servidor.js';
import type { SesionTickets } from './sesion.js';
import { crearTools } from './tools/index.js';

const MENSAJE_NO_DISPONIBLE = 'La base de datos de tickets no está disponible en este momento. Reintentá en unos minutos.';

/*
 * Servidor MCP local por stdio (Claude Desktop lo lanza como proceso hijo). stdout es el canal
 * del protocolo: todo log va a stderr.
 */
async function principal() {
  const config = cargarConfig();
  const logger = crearLogger({ ...config, app: NOMBRE_SERVIDOR });
  const acceso = crearAccesoFirebird(config, { mensajeNoDisponible: MENSAJE_NO_DISPONIBLE });

  // Un proceso = un usuario. El desarrollador se resuelve una vez, al arrancar.
  const sesion: SesionTickets = {
    codUsuario: config.MCP_COD_USUARIO,
    codDesarrollador: await codDesarrolladorDeUsuario(acceso, config.MCP_COD_USUARIO).catch((error: unknown) => {
      logger.warn({ err: error }, 'No se pudo resolver el desarrollador del usuario; "yo" en tareas no estará disponible');
      return null;
    }),
  };

  const servidor = crearServidorTickets(crearTools({ acceso, zonaHoraria: config.ZONA_HORARIA_BASE }), { logger, sesion });

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
  logger.info({ codUsuario: sesion.codUsuario, codDesarrollador: sesion.codDesarrollador }, 'mcp-tickets-json listo (stdio)');
}

principal().catch((error: unknown) => {
  process.stderr.write(`mcp-tickets-json no pudo arrancar: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

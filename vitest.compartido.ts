import { defaultServerConditions } from 'vite';
import type { ViteUserConfig } from 'vitest/config';

/**
 * Configuración común de los vitest.config.ts de paquetes y apps: los paquetes del monorepo se
 * importan desde su código fuente (condición "@mcp-jkmate/source"), así que no hace falta
 * compilarlos para correr tests. La condición lleva el scope porque "source" a secas la usan
 * también paquetes de terceros (eventsource-parser) para apuntar a su .ts.
 * El resto replica el default de Vitest, que saca "module" (apunta a builds para bundlers).
 */
const condiciones = ['@mcp-jkmate/source', ...defaultServerConditions.filter((c) => c !== 'module')];

export const resolverFuentes: Pick<ViteUserConfig, 'resolve' | 'ssr'> = {
  resolve: { conditions: condiciones },
  ssr: { resolve: { conditions: condiciones } },
};

import { defineConfig } from 'vitest/config';

// Correr `npx vitest` en la raíz ejecuta los tests de todos los paquetes y apps. Cada proyecto
// tiene su propio vitest.config.ts (con la condición "@mcp-jkmate/source", ver vitest.compartido.ts).
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
  },
});

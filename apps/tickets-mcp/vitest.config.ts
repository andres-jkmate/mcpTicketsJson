import { defineConfig } from 'vitest/config';
import { resolverFuentes } from '../../vitest.compartido.js';

export default defineConfig({
  ...resolverFuentes,
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});

import { defineConfig } from 'vitest/config';
import { resolverFuentes } from '../../vitest.compartido.js';

export default defineConfig({
  ...resolverFuentes,
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    typecheck: { enabled: true, include: ['src/**/*.test-d.ts'], tsconfig: './tsconfig.json' },
  },
});

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration suites share one database and truncate between tests, so
    // parallel files would delete each other's fixtures mid-run.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    setupFiles: ['tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});

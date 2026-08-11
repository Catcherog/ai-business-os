import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Treat the frozen @busos/contracts package as first-party TypeScript source
 * (BL-009): resolve it to packages/contracts/src/index.ts so no build step is
 * needed. Mirrors packages/service-agent-candidate/vitest.config.ts.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@busos/contracts': fileURLToPath(
        new URL('../contracts/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

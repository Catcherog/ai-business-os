import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Mirrors the other packages: treat the frozen @busos/* packages as
 * first-party TypeScript source (BL-009) so no build step is needed.
 */
export default defineConfig({
  cacheDir: '.vitest-tmp',
  resolve: {
    alias: {
      '@busos/contracts': fileURLToPath(
        new URL('../contracts/src/index.ts', import.meta.url),
      ),
      '@busos/business-repository': fileURLToPath(
        new URL('../business-repository/src/index.ts', import.meta.url),
      ),
      '@busos/lumen-adapter': fileURLToPath(
        new URL('../lumen-adapter/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Mirrors the other P1..P5 packages: treat the frozen @busos/* packages as
 * first-party TypeScript source (BL-009) so no build step is needed.
 */
export default defineConfig({
  // Local cache dir (relative to this package) so `vitest run` never writes into
  // the (junctioned) node_modules and never hits the sandbox-restricted /tmp.
  cacheDir: '.vitest-tmp',
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

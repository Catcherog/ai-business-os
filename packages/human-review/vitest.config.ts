import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Mirrors the other P1/P2 packages: treat the frozen @busos/* packages as
 * first-party TypeScript source (BL-009) so no build step is needed.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@busos/contracts': fileURLToPath(
        new URL('../contracts/src/index.ts', import.meta.url),
      ),
      '@busos/business-repository': fileURLToPath(
        new URL('../business-repository/src/index.ts', import.meta.url),
      ),
      '@busos/golden-path': fileURLToPath(
        new URL('../golden-path/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

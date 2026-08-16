import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Treat the frozen first-party @busos packages as TypeScript source (BL-009):
 * resolve them to packages/<pkg>/src/index.ts so no build step is needed.
 * Mirrors packages/workspace-read/vitest.config.ts.
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
      '@busos/human-review': fileURLToPath(
        new URL('../human-review/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

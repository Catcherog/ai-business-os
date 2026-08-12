import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Mirrors the other P1 packages: treat the frozen @busos/* packages as
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
      '@busos/service-agent-candidate': fileURLToPath(
        new URL('../service-agent-candidate/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

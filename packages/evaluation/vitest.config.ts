import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * @busos/evaluation — vitest config (repo convention: root pinned so the suite
 * runs regardless of the invoking cwd; first-party @busos packages resolved as
 * TypeScript source, no build step).
 *
 * The evaluation package depends on @busos/contracts (schemas), @busos/memory
 * (real MemoryService + assembleMemoryContext under test) and @busos/golden-path
 * (real governance engine under test).
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: {
      '@busos/contracts': fileURLToPath(
        new URL('../contracts/src/index.ts', import.meta.url),
      ),
      '@busos/memory': fileURLToPath(
        new URL('../memory/src/index.ts', import.meta.url),
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

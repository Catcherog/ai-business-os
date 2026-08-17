import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Resolve the frozen first-party @busos packages as TypeScript source (BL-009):
 * no build step needed. Mirrors packages/workspace-review/vitest.config.ts.
 * `@busos/memory` depends on `@busos/contracts` ONLY — the deterministic
 * extraction helpers are duck-typed, so no orchestrator / human-review /
 * repository alias is needed here.
 *
 * `root` is pinned to this file's directory so the suite runs regardless of the
 * invoking cwd (e.g. via a sibling package's vitest binary when this package's
 * own devDeps are not yet installed).
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
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

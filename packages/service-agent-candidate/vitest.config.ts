import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `@busos/contracts` is consumed as TypeScript source (BL-009): it exposes
 * `src/index.ts` and emits no `dist/`. The alias makes vitest transform the
 * frozen contract package as first-party source instead of treating the
 * `file:` symlink under node_modules as a pre-built dependency.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@busos/contracts': fileURLToPath(
        new URL('../contracts/src/index.ts', import.meta.url),
      ),
    },
  },
});

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Resolve the frozen first-party @busos packages as TypeScript source (BL-009):
 * no build step needed. Mirrors packages/workspace-review/vitest.config.ts but
 * adds the orchestrator and its transitive deps so the H1-03-E real-orchestrator
 * E2E (runBusinessProcess -> shared InMemoryProcessRegistry -> WorkspaceRunService)
 * resolves the full graph.
 *
 * `root` is pinned to this file's directory so the suite runs regardless of the
 * invoking cwd (e.g. via a sibling package's vitest binary when workspace-run's
 * own devDeps are not yet installed).
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: {
      '@busos/contracts': fileURLToPath(
        new URL('../contracts/src/index.ts', import.meta.url),
      ),
      '@busos/orchestrator': fileURLToPath(
        new URL('../orchestrator/src/index.ts', import.meta.url),
      ),
      '@busos/business-repository': fileURLToPath(
        new URL('../business-repository/src/index.ts', import.meta.url),
      ),
      '@busos/golden-path': fileURLToPath(
        new URL('../golden-path/src/index.ts', import.meta.url),
      ),
      '@busos/project-lifecycle': fileURLToPath(
        new URL('../project-lifecycle/src/index.ts', import.meta.url),
      ),
      '@busos/creative-production': fileURLToPath(
        new URL('../creative-production/src/index.ts', import.meta.url),
      ),
      '@busos/lumen-adapter': fileURLToPath(
        new URL('../lumen-adapter/src/index.ts', import.meta.url),
      ),
      '@busos/service-agent-candidate': fileURLToPath(
        new URL('../service-agent-candidate/src/index.ts', import.meta.url),
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

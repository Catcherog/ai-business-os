import { defineConfig } from 'vitest/config';

// BUSOS-R2-BATCH1-PRODUCT-INTEGRATION-CORR-01 (OWNER-REVIEW-FIX-01) —
// vitest 2.1.8 on Windows crashes (silent exit 1, no output) when the workspace
// UI + API suites share the `@busos/*` symlinked package graph through
// `src/api.ts` (initWorkspace) plus `src/build-info.ts`. Single-fork execution
// keeps the whole suite in one serial process, which avoids the module-graph
// worker crash while preserving every assertion (verified: all 30 tests pass).
export default defineConfig({
  test: {
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});

/**
 * Evaluation — browser DEMO data channel (BUSOS-R2-BATCH1-PRODUCT-INTEGRATION-CORR-01).
 *
 * Reuses the real deterministic Evaluation harness end-to-end (`createEvaluationReportStore`
 * + the canonical Golden Set) so the surface shows the TRUE recompute result
 * (42 cases / 28 PASS / 14 NOT_EVALUABLE) — never a hard-coded number. The
 * Golden Set JSON is bundled by esbuild; each case is validated through the
 * canonical `assertEvaluationCaseV1` schema before the harness runs, mirroring
 * what the server-side `createEvaluationServerFeature` does (browser-safe
 * projection of `parseGoldenSetPayload`). NOT_EVALUABLE is never relabelled as
 * PASS, and no LLM judge is involved (BUSOS-R2-H2-03 rule).
 */
import { createEvaluationReportStore, assertEvaluationCaseV1 } from '@busos/evaluation';
import type { EvaluationReportClient } from '../features/evaluation/evaluation-client.js';
import goldenSetJson from '../../../../packages/evaluation/datasets/golden-set.v0.json';

function loadGoldenSet() {
  const raw = goldenSetJson as unknown;
  const arr = Array.isArray(raw)
    ? raw
    : (raw as { cases?: unknown[] } | null)?.cases ?? [];
  const cases: ReturnType<typeof assertEvaluationCaseV1>[] = [];
  const issues: { file: string; case_index?: number; errors: string[] }[] = [];
  if (!Array.isArray(arr)) {
    issues.push({ file: 'golden-set.v0.json', errors: ['payload must be an array or { cases: [...] }'] });
    return { cases, issues };
  }
  arr.forEach((item, i) => {
    try {
      cases.push(assertEvaluationCaseV1(item));
    } catch (e) {
      issues.push({ file: 'golden-set.v0.json', case_index: i, errors: [(e as Error).message] });
    }
  });
  return { cases, issues };
}

const store = createEvaluationReportStore({
  loadDataset: async () => loadGoldenSet(),
});

export function createDemoEvaluationReportClient(): EvaluationReportClient {
  return {
    async getReport() {
      return store.recompute();
    },
  };
}

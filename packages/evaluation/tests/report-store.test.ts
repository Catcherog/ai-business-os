import { describe, expect, it } from 'vitest';
import type { EvaluationCaseV1 } from '../src/case-schema.js';
import {
  createEvaluationReportStore,
  type EvaluationDataset,
} from '../src/report-store.js';
import {
  DATASET_VERSION,
  EVALUATION_CASE_VERSION,
  EVALUATOR_VERSION,
} from '../src/versions.js';

function baseCase(overrides: Partial<EvaluationCaseV1>): EvaluationCaseV1 {
  return {
    version: EVALUATION_CASE_VERSION,
    case_id: 'CASE-001',
    domain: 'RETRIEVAL',
    provenance_type: 'SYNTHETIC',
    query: 'find the expected evidence',
    expected: { evidence_ids: ['evidence-1'] },
    fixture: {},
    tags: [],
    review_status: 'SYSTEM_REVIEWED',
    synthetic: true,
    ...overrides,
  };
}

function source(cases: EvaluationCaseV1[], issues: EvaluationDataset['issues'] = []): EvaluationDataset {
  return { cases, issues };
}

describe('evaluation report store', () => {
  it('recomputes the Golden Set and keeps NOT_EVALUABLE cases in the report', async () => {
    let calls = 0;
    const store = createEvaluationReportStore({
      loadDataset: async () => {
        calls += 1;
        return source([
          baseCase({ case_id: calls === 1 ? 'RET-001' : 'RET-002' }),
        ]);
      },
      dataset_version: DATASET_VERSION,
      evaluator_version: EVALUATOR_VERSION,
      run_id: 'report-store-test',
      generated_at: '2026-08-24T00:00:00.000Z',
    });

    const first = await store.recompute();
    const second = await store.recompute();

    expect(first.status).toBe('SUCCESS');
    expect(first.report?.summary).toMatchObject({
      total: 1,
      pass: 0,
      fail: 0,
      error: 0,
      not_evaluable: 1,
    });
    expect(first.report?.cases[0].status).toBe('NOT_EVALUABLE');
    expect(second.report?.cases[0].case_id).toBe('RET-002');
    expect(calls).toBe(2);
  });

  it('classifies dataset issues before running the harness', async () => {
    const store = createEvaluationReportStore({
      loadDataset: async () => source([], [{ file: 'golden-set.json', errors: ['invalid case'] }]),
    });

    const result = await store.recompute();

    expect(result.status).toBe('MALFORMED_DATASET');
    expect(result.report).toBeUndefined();
    expect(result.gate).toBeUndefined();
    expect(result.issues).toEqual([{ file: 'golden-set.json', errors: ['invalid case'] }]);
  });

  it('classifies a deterministic hard-gate failure separately from a malformed dataset', async () => {
    const store = createEvaluationReportStore({
      loadDataset: async () => source([
        baseCase({
          case_id: 'GOV-FAIL',
          domain: 'GOVERNANCE',
          query: 'expect reject but the deterministic engine approves',
          expected: { governance_decision: 'REJECT' },
          fixture: {
            candidate: { service_type: '新中式写真', intent_confidence: 0.99 },
          },
        }),
      ]),
      run_id: 'hard-gate-test',
      generated_at: '2026-08-24T00:00:00.000Z',
    });

    const result = await store.recompute();

    expect(result.status).toBe('HARD_GATE_FAILURE');
    expect(result.report?.summary.fail).toBe(1);
    expect(result.gate?.passed).toBe(false);
    expect(result.gate?.breaches.some((breach) => breach.kind === 'HARD_FAIL')).toBe(true);
  });
});

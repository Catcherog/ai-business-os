import { describe, expect, it } from 'vitest';
import {
  evaluationViewModel,
  type EvaluationViewResult,
} from '../src/features/evaluation/evaluation-view.js';

function result(status: EvaluationViewResult['status'], overrides: Partial<EvaluationViewResult> = {}): EvaluationViewResult {
  return {
    status,
    issues: [],
    ...overrides,
  };
}

describe('evaluation feature view model', () => {
  it('renders the Golden Set counts and honest NOT_EVALUABLE status', () => {
    const model = evaluationViewModel(result('SUCCESS', {
      report: {
        summary: {
          total: 42,
          pass: 28,
          fail: 0,
          error: 0,
          not_evaluable: 14,
          by_domain: {},
          by_provenance: {},
        },
        cases: [
          { case_id: 'RET-001', domain: 'RETRIEVAL', status: 'NOT_EVALUABLE' },
        ],
      },
    }));

    expect(model.statusLabel).toBe('SUCCESS');
    expect(model.headline).toContain('28 PASS');
    expect(model.counts).toEqual({ total: 42, pass: 28, fail: 0, error: 0, notEvaluable: 14 });
    expect(model.cases[0]).toMatchObject({ caseId: 'RET-001', status: 'NOT_EVALUABLE' });
  });

  it('does not present malformed data or hard-gate failure as a successful run', () => {
    expect(evaluationViewModel(result('MALFORMED_DATASET')).statusLabel).toBe('MALFORMED_DATASET');
    expect(evaluationViewModel(result('HARD_GATE_FAILURE')).statusLabel).toBe('HARD_GATE_FAILURE');
  });
});

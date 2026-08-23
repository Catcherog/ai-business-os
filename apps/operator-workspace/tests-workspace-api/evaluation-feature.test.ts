import { describe, expect, it } from 'vitest';
import {
  createEvaluationServerFeature,
  type EvaluationRunResult,
} from '../server/features/evaluation/evaluation-api.js';

function result(status: EvaluationRunResult['status']): EvaluationRunResult {
  return { status, issues: [] } as EvaluationRunResult;
}

describe('evaluation server feature', () => {
  it('recomputes the canonical Golden Set through the default report store', async () => {
    const feature = createEvaluationServerFeature();

    const response = await feature.handle({
      method: 'GET',
      pathname: '/api/evaluation/report',
    });

    expect(response?.statusCode).toBe(200);
    expect(response?.body.status).toBe('SUCCESS');
    expect(response?.body.report?.summary).toMatchObject({
      total: 42,
      pass: 28,
      fail: 0,
      error: 0,
      not_evaluable: 14,
    });
  });

  it('serves the recomputed report endpoint without owning shared server registration', async () => {
    const expected = result('SUCCESS');
    const feature = createEvaluationServerFeature({
      store: { recompute: async () => expected },
    });

    const response = await feature.handle({
      method: 'GET',
      pathname: '/api/evaluation/report',
    });

    expect(response).toEqual({ statusCode: 200, body: expected });
  });

  it('keeps malformed datasets and hard-gate failures machine-distinct', async () => {
    const malformed = createEvaluationServerFeature({
      store: { recompute: async () => result('MALFORMED_DATASET') },
    });
    const hardFailure = createEvaluationServerFeature({
      store: { recompute: async () => result('HARD_GATE_FAILURE') },
    });

    await expect(malformed.handle({ method: 'GET', pathname: '/api/evaluation' })).resolves.toEqual({
      statusCode: 422,
      body: result('MALFORMED_DATASET'),
    });
    await expect(hardFailure.handle({ method: 'GET', pathname: '/api/evaluation' })).resolves.toEqual({
      statusCode: 200,
      body: result('HARD_GATE_FAILURE'),
    });
  });

  it('ignores methods and paths outside the evaluation feature boundary', async () => {
    const feature = createEvaluationServerFeature({
      store: { recompute: async () => result('SUCCESS') },
    });

    await expect(feature.handle({ method: 'POST', pathname: '/api/evaluation/report' })).resolves.toBeNull();
    await expect(feature.handle({ method: 'GET', pathname: '/api/workspace/runs' })).resolves.toBeNull();
  });
});

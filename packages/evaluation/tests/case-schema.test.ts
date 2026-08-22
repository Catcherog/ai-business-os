import { describe, expect, it } from 'vitest';
import {
  EvaluationCaseV1Schema,
  assertEvaluationCaseV1,
  isBaselineEligible,
  validateEvaluationCaseV1,
} from '../src/case-schema.js';
import { DATASET_VERSION, EVALUATION_CASE_VERSION } from '../src/versions.js';

const validCase = {
  version: EVALUATION_CASE_VERSION,
  case_id: 'TEST-01',
  domain: 'MEMORY',
  provenance_type: 'SYNTHETIC',
  query: 'test query',
  expected: { memory_required: true },
  fixture: { memory_setup: { project_id: 'proj_x', records: [] } },
  tags: ['unit'],
  review_status: 'SYSTEM_REVIEWED',
  synthetic: true,
};

describe('EvaluationCaseV1 schema', () => {
  it('accepts a fully valid case', () => {
    expect(EvaluationCaseV1Schema.safeParse(validCase).success).toBe(true);
    expect(() => assertEvaluationCaseV1(validCase)).not.toThrow();
  });

  it('rejects invalid provenance', () => {
    const bad = { ...validCase, provenance_type: 'FAKE_SOURCE' };
    const res = validateEvaluationCaseV1(bad);
    expect(res.ok).toBe(false);
    expect(res.errors.join()).toContain('provenance_type');
  });

  it('rejects unknown domain', () => {
    const bad = { ...validCase, domain: 'HACKING' };
    const res = validateEvaluationCaseV1(bad);
    expect(res.ok).toBe(false);
    expect(res.errors.join()).toContain('domain');
  });

  it('rejects missing query', () => {
    const { query: _q, ...bad } = validCase;
    const res = validateEvaluationCaseV1(bad);
    expect(res.ok).toBe(false);
    expect(res.errors.join()).toContain('query');
  });

  it('rejects unknown review_status', () => {
    const bad = { ...validCase, review_status: 'OWNER_SAID_OK' };
    const res = validateEvaluationCaseV1(bad);
    expect(res.ok).toBe(false);
    expect(res.errors.join()).toContain('review_status');
  });

  it('is strict: extra top-level fields are rejected', () => {
    const bad = { ...validCase, hacker_field: true };
    const res = validateEvaluationCaseV1(bad);
    expect(res.ok).toBe(false);
    expect(res.errors.join()).toContain('hacker_field');
  });

  it('is strict: extra expected fields are rejected', () => {
    const bad = { ...validCase, expected: { memory_required: true, made_up: 1 } };
    const res = validateEvaluationCaseV1(bad);
    expect(res.ok).toBe(false);
    expect(res.errors.join()).toContain('made_up');
  });

  it('requires version === evaluation_case.v1', () => {
    const bad = { ...validCase, version: 'evaluation_case.v0' };
    const res = validateEvaluationCaseV1(bad);
    expect(res.ok).toBe(false);
  });
});

describe('baseline eligibility', () => {
  it('only APPROVED and SYSTEM_REVIEWED enter the canonical baseline', () => {
    expect(isBaselineEligible({ review_status: 'APPROVED' })).toBe(true);
    expect(isBaselineEligible({ review_status: 'SYSTEM_REVIEWED' })).toBe(true);
    expect(isBaselineEligible({ review_status: 'REVIEWED' })).toBe(false);
    expect(isBaselineEligible({ review_status: 'DRAFT' })).toBe(false);
  });
});

describe('dataset version constant', () => {
  it('dataset version is pinned (no bare percentages)', () => {
    expect(DATASET_VERSION).toBe('golden-set.v0');
  });
});

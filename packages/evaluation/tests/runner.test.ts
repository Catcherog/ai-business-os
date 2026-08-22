import { describe, expect, it } from 'vitest';
import { runEvaluation } from '../src/runner.js';
import type { EvaluationCaseV1 } from '../src/case-schema.js';
import { EVALUATION_CASE_VERSION, EVALUATOR_VERSION, DATASET_VERSION } from '../src/versions.js';

const base: Pick<
  EvaluationCaseV1,
  'version' | 'query' | 'tags' | 'synthetic'
> = {
  version: EVALUATION_CASE_VERSION,
  query: 'q',
  tags: [],
  synthetic: true,
};

const passEvaluator = async () => ({ status: 'PASS' as const, dimension_scores: { x: 1 } });

describe('evaluation runner', () => {
  it('filters DRAFT/REVIEWED cases out of the canonical run', async () => {
    const cases = [
      { ...base, case_id: 'A', domain: 'MEMORY' as const, provenance_type: 'SYNTHETIC' as const, review_status: 'SYSTEM_REVIEWED' as const },
      { ...base, case_id: 'B', domain: 'MEMORY' as const, provenance_type: 'SYNTHETIC' as const, review_status: 'DRAFT' as const },
      { ...base, case_id: 'C', domain: 'MEMORY' as const, provenance_type: 'SYNTHETIC' as const, review_status: 'APPROVED' as const },
    ];
    const report = await runEvaluation({
      cases,
      evaluators: { MEMORY: passEvaluator },
      evaluator_version: EVALUATOR_VERSION,
      dataset_version: DATASET_VERSION,
    });
    expect(report.cases.map((c) => c.case_id).sort()).toEqual(['A', 'C']);
  });

  it('includes non-baseline cases with includeNonBaseline', async () => {
    const cases = [
      { ...base, case_id: 'B', domain: 'MEMORY' as const, provenance_type: 'SYNTHETIC' as const, review_status: 'DRAFT' as const },
    ];
    const report = await runEvaluation({
      cases,
      evaluators: { MEMORY: passEvaluator },
      includeNonBaseline: true,
      evaluator_version: EVALUATOR_VERSION,
      dataset_version: DATASET_VERSION,
    });
    expect(report.cases).toHaveLength(1);
  });

  it('marks cases NOT_EVALUABLE when no evaluator is wired for the domain', async () => {
    const cases = [
      { ...base, case_id: 'R', domain: 'RETRIEVAL' as const, provenance_type: 'SYNTHETIC' as const, review_status: 'SYSTEM_REVIEWED' as const },
    ];
    const report = await runEvaluation({
      cases,
      evaluators: {},
      evaluator_version: EVALUATOR_VERSION,
      dataset_version: DATASET_VERSION,
    });
    expect(report.cases[0].status).toBe('NOT_EVALUABLE');
    expect(report.summary.not_evaluable).toBe(1);
  });

  it('turns an evaluator throw into an ERROR case (never crashes the run)', async () => {
    const boom = async () => {
      throw new Error('kaboom');
    };
    const cases = [
      { ...base, case_id: 'E', domain: 'MEMORY' as const, provenance_type: 'SYNTHETIC' as const, review_status: 'SYSTEM_REVIEWED' as const },
    ];
    const report = await runEvaluation({
      cases,
      evaluators: { MEMORY: boom },
      evaluator_version: EVALUATOR_VERSION,
      dataset_version: DATASET_VERSION,
    });
    expect(report.cases[0].status).toBe('ERROR');
    expect(report.summary.error).toBe(1);
  });

  it('aggregates summary by domain and provenance', async () => {
    const cases = [
      { ...base, case_id: 'A', domain: 'MEMORY' as const, provenance_type: 'VERIFIED_KB' as const, review_status: 'SYSTEM_REVIEWED' as const },
      { ...base, case_id: 'B', domain: 'MEMORY' as const, provenance_type: 'SYNTHETIC' as const, review_status: 'SYSTEM_REVIEWED' as const },
      { ...base, case_id: 'C', domain: 'GOVERNANCE' as const, provenance_type: 'SYNTHETIC' as const, review_status: 'SYSTEM_REVIEWED' as const },
    ];
    const report = await runEvaluation({
      cases,
      evaluators: { MEMORY: passEvaluator, GOVERNANCE: passEvaluator },
      evaluator_version: EVALUATOR_VERSION,
      dataset_version: DATASET_VERSION,
    });
    expect(report.summary.total).toBe(3);
    expect(report.summary.pass).toBe(3);
    expect(report.summary.by_domain.MEMORY.total).toBe(2);
    expect(report.summary.by_domain.GOVERNANCE.total).toBe(1);
    expect(report.summary.by_provenance.VERIFIED_KB.total).toBe(1);
  });

  it('carries version + dataset identity in every report (no bare percentages)', async () => {
    const cases = [
      { ...base, case_id: 'A', domain: 'MEMORY' as const, provenance_type: 'SYNTHETIC' as const, review_status: 'SYSTEM_REVIEWED' as const },
    ];
    const report = await runEvaluation({
      cases,
      evaluators: { MEMORY: passEvaluator },
      evaluator_version: EVALUATOR_VERSION,
      dataset_version: DATASET_VERSION,
      generated_at: '2026-08-21T00:00:00.000Z',
    });
    expect(report.evaluator_version).toBe(EVALUATOR_VERSION);
    expect(report.dataset_version).toBe(DATASET_VERSION);
    expect(report.generated_at).toBe('2026-08-21T00:00:00.000Z');
    expect(report.version).toBe('evaluation_report.v1');
  });
});

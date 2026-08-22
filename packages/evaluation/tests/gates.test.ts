import { describe, expect, it } from 'vitest';
import { checkGates, flattenMetrics } from '../src/gates.js';
import { EVALUATOR_VERSION, DATASET_VERSION } from '../src/versions.js';
import type { EvaluationReport } from '../src/runner.js';

function report(overrides: Partial<EvaluationReport> = {}): EvaluationReport {
  return {
    run_id: 'run_t',
    version: 'evaluation_report.v1',
    evaluator_version: EVALUATOR_VERSION,
    dataset_version: DATASET_VERSION,
    generated_at: '2026-08-21T00:00:00.000Z',
    summary: {
      total: 3,
      pass: 3,
      fail: 0,
      error: 0,
      not_evaluable: 0,
      by_domain: {},
      by_provenance: {},
    },
    metrics: {
      memory: { precision: 1, relevant_recall: 1, pollution_rate: 0, stale_memory_usage_rate: 0, missing_count: 0 },
      governance: {
        decision_accuracy: 1,
        human_required_accuracy: 1,
        unsafe_pass_count: 0,
        false_escalation_count: 0,
        missed_escalation_count: 0,
        governance_bypass_count: 0,
      },
    },
    cases: [],
    ...overrides,
  };
}

const baseline = {
  dataset_version: DATASET_VERSION,
  evaluator_version: EVALUATOR_VERSION,
  generated_at: '2026-08-20T00:00:00.000Z',
  commit_sha: null,
  metrics: {
    'memory.precision': 1,
    'memory.relevant_recall': 1,
    'governance.decision_accuracy': 1,
  },
};

describe('regression gates', () => {
  it('passes a clean report against its baseline', () => {
    const g = checkGates(report(), { baseline });
    expect(g.passed).toBe(true);
    expect(g.breaches).toHaveLength(0);
  });

  it('fails the hard gate on any FAIL case', () => {
    const g = checkGates(report({ summary: { ...report().summary, fail: 1 } }), { baseline });
    expect(g.passed).toBe(false);
    expect(g.breaches[0].kind).toBe('HARD_FAIL');
  });

  it('fails the hard gate on any ERROR case', () => {
    const g = checkGates(report({ summary: { ...report().summary, error: 1 } }), {});
    expect(g.passed).toBe(false);
    expect(g.breaches[0].kind).toBe('HARD_ERROR');
  });

  it('detects a metric regression vs the baseline beyond threshold', () => {
    const degraded = report({
      metrics: {
        memory: { precision: 0.8, relevant_recall: 0.9, pollution_rate: 0.2, stale_memory_usage_rate: 0.1, missing_count: 1 },
        governance: {
          decision_accuracy: 1,
          human_required_accuracy: 1,
          unsafe_pass_count: 0,
          false_escalation_count: 0,
          missed_escalation_count: 0,
          governance_bypass_count: 0,
        },
      },
    });
    const g = checkGates(degraded, { baseline, delta_thresholds: { 'memory.precision': 0.05 } });
    expect(g.passed).toBe(false);
    expect(g.breaches.some((b) => b.kind === 'METRIC_REGRESSION' && b.detail.includes('memory.precision'))).toBe(true);
  });

  it('flags a dataset/evaluator version mismatch vs the baseline', () => {
    const g = checkGates(report({ dataset_version: 'golden-set.v1' }), { baseline });
    expect(g.passed).toBe(false);
    expect(g.breaches.some((b) => b.kind === 'VERSION_MISMATCH')).toBe(true);
  });

  it('requires a baseline when configured', () => {
    const g = checkGates(report(), { require_baseline: true, baseline: undefined });
    expect(g.passed).toBe(false);
    expect(g.breaches[0].kind).toBe('NO_BASELINE');
  });

  it('flattens metrics into stable keys', () => {
    const flat = flattenMetrics(report());
    expect(flat['memory.precision']).toBe(1);
    expect(flat['governance.decision_accuracy']).toBe(1);
  });
});

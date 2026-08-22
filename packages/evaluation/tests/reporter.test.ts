import { describe, expect, it } from 'vitest';
import { caseTable, renderSummaryMarkdown } from '../src/reporter.js';
import { EVALUATOR_VERSION, DATASET_VERSION } from '../src/versions.js';
import type { EvaluationReport } from '../src/runner.js';

const report: EvaluationReport = {
  run_id: 'run_1',
  version: 'evaluation_report.v1',
  evaluator_version: EVALUATOR_VERSION,
  dataset_version: DATASET_VERSION,
  generated_at: '2026-08-21T00:00:00.000Z',
  summary: {
    total: 3,
    pass: 2,
    fail: 1,
    error: 0,
    not_evaluable: 0,
    by_domain: { MEMORY: { total: 2, pass: 2, fail: 0, error: 0, not_evaluable: 0 }, GOVERNANCE: { total: 1, pass: 0, fail: 1, error: 0, not_evaluable: 0 } },
    by_provenance: { SYNTHETIC: { total: 3, pass: 2, fail: 1, error: 0, not_evaluable: 0 } },
  },
  metrics: {
    memory: { precision: 1, relevant_recall: 1, pollution_rate: 0, stale_memory_usage_rate: 0, missing_count: 0 },
    governance: {
      decision_accuracy: 0.5,
      human_required_accuracy: 1,
      unsafe_pass_count: 0,
      false_escalation_count: 0,
      missed_escalation_count: 0,
      governance_bypass_count: 0,
    },
  },
  cases: [
    {
      case_id: 'MEM-01',
      domain: 'MEMORY',
      provenance_type: 'SYNTHETIC',
      review_status: 'SYSTEM_REVIEWED',
      tags: [],
      status: 'PASS',
      expected: {},
    },
    {
      case_id: 'GOV-03',
      domain: 'GOVERNANCE',
      provenance_type: 'SYNTHETIC',
      review_status: 'SYSTEM_REVIEWED',
      tags: [],
      status: 'FAIL',
      expected: {},
      failure_reason: 'decision=APPROVE, expected REJECT',
    },
    {
      case_id: 'RET-01',
      domain: 'RETRIEVAL',
      provenance_type: 'SYNTHETIC',
      review_status: 'SYSTEM_REVIEWED',
      tags: [],
      status: 'NOT_EVALUABLE',
      expected: {},
      failure_reason: 'no retrieval layer exists in BUSOS (KB-SNAPSHOT F-01)',
    },
  ],
};

describe('reporter', () => {
  it('renders a summary containing totals, metrics and failure cases', () => {
    const md = renderSummaryMarkdown(report, { passed: false, breaches: [{ kind: 'HARD_FAIL', detail: '1 FAIL cases (max 0)' }] });
    expect(md).toContain('# Evaluation Summary');
    expect(md).toContain('| TOTAL | 3 | 2 | 1 | 0 | 0 |');
    expect(md).toContain('Memory Precision');
    expect(md).toContain('decision accuracy');
    expect(md).toContain('GOV-03');
    expect(md).toContain('HARD_FAIL');
  });

  it('renders an empty failure section honestly', () => {
    const clean = { ...report, summary: { ...report.summary, fail: 0 }, cases: report.cases.filter((c) => c.status !== 'FAIL') };
    const md = renderSummaryMarkdown(clean, { passed: true, breaches: [] });
    expect(md).toContain('_(none)_');
  });

  it('renders a per-case table', () => {
    const t = caseTable(report.cases);
    expect(t).toContain('| MEM-01 | MEMORY |');
    expect(t).toContain('| RET-01 | RETRIEVAL |');
  });
});

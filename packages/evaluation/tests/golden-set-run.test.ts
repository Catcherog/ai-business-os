import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadGoldenSetFile } from '../src/loader.js';
import { runEvaluation } from '../src/runner.js';
import { checkGates } from '../src/gates.js';
import { evaluateMemoryCase } from '../src/evaluators/memory-evaluator.js';
import { evaluateGovernanceCase } from '../src/evaluators/governance-evaluator.js';
import { EVALUATOR_VERSION, DATASET_VERSION } from '../src/versions.js';

/**
 * THE TIER-1 CI REGRESSION GATE (BUSOS-R2-H2-03 §17).
 *
 * Executes the ENTIRE canonical Golden Set against the REAL BUSOS code
 * (MemoryService + assembleMemoryContext + govern). Any executed case that
 * fails — i.e. any regression in Memory / Governance behaviour, contract, or
 * lifecycle semantics — fails this suite and the push CI. Retrieval /
 * Generation cases are honestly NOT_EVALUABLE (no production surface, F-01) —
 * they are counted, never faked.
 */

const DATASET = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'datasets',
  'golden-set.v0.json',
);

describe('golden set canonical run (CI regression gate)', () => {
  it('loads the golden set without dataset issues', async () => {
    const { cases, issues } = await loadGoldenSetFile(DATASET);
    expect(issues).toHaveLength(0);
    expect(cases).toHaveLength(42);
  });

  it('executes all 42 cases: 28 PASS, 14 NOT_EVALUABLE, 0 FAIL, 0 ERROR', async () => {
    const { cases } = await loadGoldenSetFile(DATASET);
    const report = await runEvaluation({
      cases,
      evaluators: {
        MEMORY: evaluateMemoryCase,
        GOVERNANCE: evaluateGovernanceCase,
      },
      evaluator_version: EVALUATOR_VERSION,
      dataset_version: DATASET_VERSION,
      generated_at: '2026-08-21T06:00:00.000Z',
    });

    expect(report.summary.total).toBe(42);
    expect(report.summary.pass).toBe(28);
    expect(report.summary.fail).toBe(0);
    expect(report.summary.error).toBe(0);
    expect(report.summary.not_evaluable).toBe(14);
  });

  it('reports perfect memory metrics (no contamination, nothing missed)', async () => {
    const { cases } = await loadGoldenSetFile(DATASET);
    const report = await runEvaluation({
      cases,
      evaluators: { MEMORY: evaluateMemoryCase, GOVERNANCE: evaluateGovernanceCase },
      evaluator_version: EVALUATOR_VERSION,
      dataset_version: DATASET_VERSION,
    });
    const mem = report.metrics.memory;
    expect(mem).toBeDefined();
    expect(mem!.precision).toBeCloseTo(1, 10);
    expect(mem!.relevant_recall).toBeCloseTo(1, 10);
    expect(mem!.pollution_rate).toBeCloseTo(0, 10);
    expect(mem!.stale_memory_usage_rate).toBeCloseTo(0, 10);
  });

  it('reports perfect governance accuracy (no unsafe pass / bypass)', async () => {
    const { cases } = await loadGoldenSetFile(DATASET);
    const report = await runEvaluation({
      cases,
      evaluators: { MEMORY: evaluateMemoryCase, GOVERNANCE: evaluateGovernanceCase },
      evaluator_version: EVALUATOR_VERSION,
      dataset_version: DATASET_VERSION,
    });
    const gov = report.metrics.governance;
    expect(gov).toBeDefined();
    expect(gov!.decision_accuracy).toBeCloseTo(1, 10);
    expect(gov!.human_required_accuracy).toBeCloseTo(1, 10);
    expect(gov!.unsafe_pass_count).toBe(0);
    expect(gov!.governance_bypass_count).toBe(0);
  });

  it('passes the hard regression gate (zero tolerated FAIL/ERROR)', async () => {
    const { cases } = await loadGoldenSetFile(DATASET);
    const report = await runEvaluation({
      cases,
      evaluators: { MEMORY: evaluateMemoryCase, GOVERNANCE: evaluateGovernanceCase },
      evaluator_version: EVALUATOR_VERSION,
      dataset_version: DATASET_VERSION,
    });
    const gate = checkGates(report, {});
    expect(gate.passed).toBe(true);
    expect(gate.breaches).toHaveLength(0);
  });

  it('covers the four-layer provenance model and every domain', async () => {
    const { cases } = await loadGoldenSetFile(DATASET);
    const byProv = new Set(cases.map((c) => c.provenance_type));
    expect([...byProv].sort()).toEqual(['ADVERSARIAL', 'BUSINESS_ABSTRACTED', 'SYNTHETIC', 'VERIFIED_KB']);
    const byDomain = new Set(cases.map((c) => c.domain));
    expect([...byDomain].sort()).toEqual(['GENERATION', 'GOVERNANCE', 'MEMORY', 'RETRIEVAL']);
  });

  it('never fabricates Owner approval: no case is marked APPROVED', async () => {
    const { cases } = await loadGoldenSetFile(DATASET);
    expect(cases.some((c) => c.review_status === 'APPROVED')).toBe(false);
    expect(cases.every((c) => c.review_status === 'SYSTEM_REVIEWED')).toBe(true);
  });
});

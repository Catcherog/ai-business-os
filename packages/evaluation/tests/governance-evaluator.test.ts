import { describe, expect, it } from 'vitest';
import { EVALUATION_CASE_VERSION } from '../src/versions.js';
import type { EvaluationCaseV1, EvaluationExpected } from '../src/case-schema.js';
import {
  buildCandidateFromFixture,
  evaluateGovernanceCase,
} from '../src/evaluators/governance-evaluator.js';
import { assertLeadCandidateV1 } from '@busos/contracts';

function govCase(
  fixture: Record<string, unknown>,
  expected: Record<string, unknown>,
): EvaluationCaseV1 {
  return {
    version: EVALUATION_CASE_VERSION,
    case_id: 'GOV-T',
    domain: 'GOVERNANCE',
    provenance_type: 'SYNTHETIC',
    query: 'q',
    expected: expected as EvaluationExpected,
    fixture: { candidate: fixture },
    tags: [],
    review_status: 'SYSTEM_REVIEWED',
    synthetic: true,
  };
}

describe('governance evaluator (real govern engine)', () => {
  it('builds a contract-valid candidate from a fixture', () => {
    const c = buildCandidateFromFixture('GOV-T', {
      service_type: '新中式写真',
      intent_confidence: 0.9,
      phone: null,
      wechat: null,
    });
    expect(() => assertLeadCandidateV1(c)).not.toThrow();
    expect(c.requirement.service_type).toBe('新中式写真');
  });

  it('APPROVEs a complete candidate', async () => {
    const r = await evaluateGovernanceCase(
      govCase(
        { service_type: '新中式写真', intent_confidence: 0.95 },
        { governance_decision: 'APPROVE', human_required: false },
      ),
    );
    expect(r.status).toBe('PASS');
    expect((r.actual as { decision: string }).decision).toBe('APPROVE');
  });

  it('REJECTs a candidate without service_type (zero-write fail-closed)', async () => {
    const r = await evaluateGovernanceCase(
      govCase(
        { service_type: null, intent_confidence: 0.95 },
        { governance_decision: 'REJECT', human_required: false },
      ),
    );
    expect(r.status).toBe('PASS');
  });

  it('escalates low confidence to REVIEW_REQUIRED (human_required)', async () => {
    const r = await evaluateGovernanceCase(
      govCase(
        { service_type: '新中式写真', intent_confidence: 0.5 },
        { governance_decision: 'REVIEW_REQUIRED', human_required: true },
      ),
    );
    expect(r.status).toBe('PASS');
  });

  it('FAILs when the real engine contradicts the golden expectation', async () => {
    const r = await evaluateGovernanceCase(
      govCase(
        { service_type: '新中式写真', intent_confidence: 0.95 },
        { governance_decision: 'REJECT' },
      ),
    );
    expect(r.status).toBe('FAIL');
    expect(r.failure_reason).toContain('decision=APPROVE');
  });

  it('does NOT promote a REJECT to REVIEW_REQUIRED (fail-closed preserved)', async () => {
    const r = await evaluateGovernanceCase(
      govCase(
        { service_type: null, intent_confidence: 0.4 },
        { governance_decision: 'REJECT', human_required: false },
      ),
    );
    expect(r.status).toBe('PASS');
  });
});

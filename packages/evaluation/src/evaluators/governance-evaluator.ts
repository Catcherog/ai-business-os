/**
 * Governance evaluator (BUSOS-R2-H2-03) — evaluates the REAL deterministic
 * governance engine `govern` from `@busos/golden-path` (BUSOS-R2-P2-GP-001,
 * RULE-025): missing `service_type` → REJECT; `intent.confidence < 0.6` →
 * REVIEW_REQUIRED (softens APPROVE only); identity presence → UNRESOLVED /
 * NOT_REQUIRED.
 *
 * A golden case drives the evaluator through `fixture.candidate`:
 *   - `service_type`        — requirement.service_type (null/"" → REJECT)
 *   - `intent_confidence`   — candidate intent confidence
 *   - `phone` / `wechat`    — extracted customer identity
 *
 * The candidate is built deterministically from the fixture (fixed ids / now)
 * and validated against the frozen `lead_candidate.v1` contract before being
 * governed, so the evaluator tests the REAL policy, not a re-implementation.
 */

import { govern } from '@busos/golden-path';
import {
  CONTRACT_VERSIONS,
  assertLeadCandidateV1,
  type GovernanceDecision,
  type LeadCandidateV1,
} from '@busos/contracts';
import type { EvaluationCaseV1 } from '../case-schema.js';
import type { CaseOutcome, DimensionScores } from '../judges.js';

export const GOVERNANCE_EVALUATOR_VERSION = '0.1.0';

export interface GovernanceCandidateFixture {
  service_type?: string | null;
  intent_confidence?: number | null;
  phone?: string | null;
  wechat?: string | null;
}

export function isGovernanceCandidateFixture(v: unknown): v is GovernanceCandidateFixture {
  if (!v || typeof v !== 'object') return false;
  const f = v as Record<string, unknown>;
  return (
    'service_type' in f ||
    'intent_confidence' in f ||
    'phone' in f ||
    'wechat' in f
  );
}

/** Build a deterministic, contract-valid LeadCandidateV1 from the fixture. */
export function buildCandidateFromFixture(
  caseId: string,
  f: GovernanceCandidateFixture,
): LeadCandidateV1 {
  const confidence =
    typeof f.intent_confidence === 'number' && Number.isFinite(f.intent_confidence)
      ? f.intent_confidence
      : 1;
  const candidate: LeadCandidateV1 = {
    version: CONTRACT_VERSIONS.LEAD_CANDIDATE_V1,
    candidate_id: `cand_eval_${caseId}`,
    session_id: 'sess_eval_h203',
    agent_run_id: 'run_eval_h203',
    intent: { type: 'price_consultation', confidence },
    customer_candidate: {
      name: null,
      phone: f.phone ?? null,
      wechat: f.wechat ?? null,
    },
    requirement: {
      service_type: f.service_type ?? null,
      budget_min: null,
      budget_max: null,
      preferred_date_text: null,
      notes: null,
    },
    evidence: [
      {
        field: 'requirement.service_type',
        source_text: f.service_type ?? '(none)',
      },
    ],
    governance: { status: 'PENDING_REVIEW', risk_level: 'R0', missing_fields: [] },
    created_at: '2026-08-21T06:00:00.000Z',
  };
  return assertLeadCandidateV1(candidate);
}

export async function evaluateGovernanceCase(
  case_: EvaluationCaseV1,
): Promise<CaseOutcome> {
  const started = Date.now();
  const fixture = case_.fixture;
  if (!fixture || !isGovernanceCandidateFixture(fixture.candidate)) {
    return {
      status: 'ERROR',
      failure_reason: 'governance case requires fixture.candidate',
      latency_ms: Date.now() - started,
    };
  }

  const expected = case_.expected ?? {};
  const candidate = buildCandidateFromFixture(case_.case_id, fixture.candidate);

  try {
    const result = govern(candidate);
    const actualDecision = result.decision as GovernanceDecision;
    const actualHumanRequired = result.decision === 'REVIEW_REQUIRED';

    const scores: DimensionScores = {};
    const failures: string[] = [];
    let ok = true;

    if (expected.governance_decision !== undefined) {
      const match = actualDecision === expected.governance_decision;
      ok = ok && match;
      scores.decision_match = match ? 1 : 0;
      if (!match) failures.push(`decision=${actualDecision}, expected ${expected.governance_decision}`);
    }
    if (expected.human_required !== undefined) {
      const match = actualHumanRequired === expected.human_required;
      ok = ok && match;
      scores.human_required_match = match ? 1 : 0;
      if (!match) {
        failures.push(
          `human_required=${actualHumanRequired}, expected ${expected.human_required}`,
        );
      }
    }

    return {
      status: ok ? 'PASS' : 'FAIL',
      failure_reason: ok ? undefined : failures.join('; '),
      dimension_scores: scores,
      actual: {
        decision: actualDecision,
        human_required: actualHumanRequired,
        issues: result.issues.map((i) => i.code),
        customer_resolution: result.customer_resolution.status,
      },
      latency_ms: Date.now() - started,
    };
  } catch (e) {
    // A governed run that throws is a system failure, not a business decision.
    return {
      status: 'ERROR',
      failure_reason: `govern threw: ${(e as Error).message}`,
      latency_ms: Date.now() - started,
    };
  }
}

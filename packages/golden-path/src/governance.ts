import {
  CONTRACT_VERSIONS,
  GOVERNANCE_ISSUE_CODES,
  assertGovernanceResultV1,
  type GovernanceResultV1,
  type LeadCandidateV1,
  type GovernanceDecision,
  type CustomerResolution,
} from '@busos/contracts';
import type { GovernanceFn } from './types.js';

/**
 * Minimal Governance Engine for BUSOS-P2-GP-001.
 *
 * Scope is deliberately tiny — just enough to let the golden path decide whether
 * a candidate may be written. No scoring, no LLM, no human-approval UI.
 *
 * Rules (fail-closed):
 * - A `Lead` requires a non-null `service_type` (LeadSchema is strict; an empty
 *   service_type can never become a canonical Lead). A candidate without one is
 *   REJECTED. This resolves BL-005 for the golden path: the rule is "reject",
 *   not "allow a placeholder", and it is enforced here, not by guessing a value.
 * - Exact customer identity (phone/wechat) is recorded as UNRESOLVED; the
 *   repository resolves it by exact match. Absent identity is NOT_REQUIRED
 *   (anonymous lead is allowed, D010).
 * - Only `APPROVE` permits the orchestration to write. `REJECT` (and any future
 *   `REVIEW_REQUIRED`) blocks the write with zero repository side effects.
 *
 * The result is validated against the frozen `governance_result.v1` contract on
 * the way out, so a malformed governance object can never escape.
 */
export const govern: GovernanceFn = (candidate: LeadCandidateV1): GovernanceResultV1 => {
  const issues: { code: string; field: string | null }[] = [];
  let decision: GovernanceDecision = 'APPROVE';

  const serviceType = candidate.requirement.service_type;
  if (!serviceType || serviceType.trim().length === 0) {
    decision = 'REJECT';
    issues.push({
      code: GOVERNANCE_ISSUE_CODES.SERVICE_TYPE_MISSING,
      field: 'requirement.service_type',
    });
  }

  const hasIdentity = Boolean(
    candidate.customer_candidate.phone || candidate.customer_candidate.wechat,
  );
  const customerResolution: CustomerResolution = hasIdentity
    ? { status: 'UNRESOLVED', customer_id: null }
    : { status: 'NOT_REQUIRED', customer_id: null };

  const result: GovernanceResultV1 = {
    version: CONTRACT_VERSIONS.GOVERNANCE_RESULT_V1,
    candidate_id: candidate.candidate_id,
    decision,
    issues,
    customer_resolution: customerResolution,
    normalized_data: {},
    created_at: new Date().toISOString(),
  };

  return assertGovernanceResultV1(result);
};

/** Convenience predicate used by the orchestration. */
export function governancePermitsWrite(g: GovernanceResultV1): boolean {
  return g.decision === 'APPROVE';
}

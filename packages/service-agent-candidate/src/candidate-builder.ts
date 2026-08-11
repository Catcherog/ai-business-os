import { randomUUID } from 'node:crypto';

import {
  CONTRACT_VERSIONS,
  assertLeadCandidateV1,
  type EvidenceItem,
  type LeadCandidateV1,
  type RiskLevel,
} from '@busos/contracts';

import {
  AGENT_INTENT_TO_CANDIDATE_INTENT,
  assertConsultationContextV1,
} from './consultation-context.js';
import {
  extractIdentity,
  extractRequirement,
  type ExtractedField,
} from './extract.js';

/**
 * Candidate Builder — BUSOS-P1-02.
 *
 * Responsibilities (task §7, deliberately no more than this):
 *   1. accept the Service Agent's consultation context
 *   2. extract the requirement / identity fields
 *   3. carry the agent's session and run IDs, mint a candidate ID
 *   4. assemble a `LeadCandidateV1`
 *   5. use explicit `null` for anything unknown
 *   6. attach evidence for extracted values
 *   7. initialise `governance.status = PENDING_REVIEW`
 *   8. validate against the frozen contract
 *   9. return the candidate
 *
 * Explicitly NOT its job: governance decisions, customer resolution, Lead or
 * Customer creation, Feishu persistence, readback (D015, D017, D018). This
 * module performs no I/O of any kind.
 */

/**
 * A candidate is always born `PENDING_REVIEW`. The real decision lives in
 * `GovernanceResultV1`, never here (D016).
 */
export const CANDIDATE_INITIAL_GOVERNANCE_STATUS = 'PENDING_REVIEW' as const;

/**
 * Neutral initial risk marker.
 *
 * Risk classification is a governance responsibility, and BUSOS-P1-02 must not
 * implement a Governance Engine. Note that the Service Agent's own
 * `AgentState.risk_level` is a *reply-safety* signal (should a human take
 * over?), which is a different axis from the business risk of the extracted
 * lead data — so it is deliberately not copied into the candidate.
 */
export const CANDIDATE_INITIAL_RISK_LEVEL: RiskLevel = 'R0';

export interface BuildLeadCandidateOptions {
  /** Injected clock, so tests can assert a deterministic `created_at`. */
  now?: Date;
  /** Injected candidate ID, so tests can assert a deterministic payload. */
  candidateId?: string;
}

/** `cand_<16 hex>`, matching the Service Agent's own ID conventions. */
export function generateCandidateId(): string {
  return `cand_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function pushEvidence(
  sink: EvidenceItem[],
  field: string,
  extracted: ExtractedField<unknown>,
): void {
  if (extracted.value === null) return;
  const sourceText = extracted.source_text;
  if (sourceText === null || sourceText.length === 0) return;
  sink.push({ field, source_text: sourceText });
}

/**
 * Turn a Service Agent consultation context into a validated
 * `LeadCandidateV1`.
 *
 * @throws ZodError if the inbound context violates the boundary payload.
 * @throws ContractValidationError if the assembled candidate would violate the
 *         frozen `lead_candidate.v1` contract.
 */
export function buildLeadCandidate(
  input: unknown,
  options: BuildLeadCandidateOptions = {},
): LeadCandidateV1 {
  // Validate on the way in as well as on the way out (D014).
  const context = assertConsultationContextV1(input);

  const requirement = extractRequirement(context.message);
  const identity = extractIdentity(context.message);

  // Evidence for every value actually extracted (D012). Absent values get no
  // evidence entry, because there is no source text to point at.
  const evidence: EvidenceItem[] = [];
  pushEvidence(evidence, 'requirement.service_type', requirement.service_type);
  pushEvidence(evidence, 'requirement.budget_min', requirement.budget_min);
  pushEvidence(evidence, 'requirement.budget_max', requirement.budget_max);
  pushEvidence(
    evidence,
    'requirement.preferred_date_text',
    requirement.preferred_date_text,
  );
  pushEvidence(evidence, 'customer_candidate.name', identity.name);
  pushEvidence(evidence, 'customer_candidate.phone', identity.phone);
  pushEvidence(evidence, 'customer_candidate.wechat', identity.wechat);

  const candidate = {
    version: CONTRACT_VERSIONS.LEAD_CANDIDATE_V1,
    candidate_id: options.candidateId ?? generateCandidateId(),
    // Traceability chain required by V1-G5: the agent owns these two IDs.
    session_id: context.conversation_id,
    agent_run_id: context.run_id,
    intent: {
      type: AGENT_INTENT_TO_CANDIDATE_INTENT[context.intent],
      confidence: context.intent_confidence,
    },
    customer_candidate: {
      name: identity.name.value,
      phone: identity.phone.value,
      wechat: identity.wechat.value,
    },
    requirement: {
      service_type: requirement.service_type.value,
      budget_min: requirement.budget_min.value,
      budget_max: requirement.budget_max.value,
      preferred_date_text: requirement.preferred_date_text.value,
      // No free-text notes are synthesised: the agent stated none.
      notes: null,
    },
    evidence,
    governance: {
      status: CANDIDATE_INITIAL_GOVERNANCE_STATUS,
      risk_level: CANDIDATE_INITIAL_RISK_LEVEL,
      // Left empty on purpose: deciding which absent field blocks a Lead is a
      // governance rule (see BL-005), and BUSOS-P1-02 must not implement one.
      missing_fields: [],
    },
    created_at: (options.now ?? new Date()).toISOString(),
  };

  // The frozen P1-01 validator is the gate: an invalid candidate never escapes.
  return assertLeadCandidateV1(candidate);
}

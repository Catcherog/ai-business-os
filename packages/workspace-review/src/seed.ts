import { CONTRACT_VERSIONS } from '@busos/contracts';
import type {
  LeadCandidateV1,
  GovernanceResultV1,
  EvidenceItem,
} from '@busos/contracts';
import type { ReviewCase } from '@busos/human-review';
import type {
  GovernanceIssue,
  CustomerResolutionStatus,
} from '@busos/contracts';

/**
 * Deterministic demo review dataset for the H1-02 Operator Workspace surface.
 *
 * Every case is a canonical `LeadCandidateV1` + `GovernanceResultV1` with
 * meaningful evidence and governance issues so the operator can understand WHY
 * the review is required. The data uses the *real* R1 contract semantics —
 * nothing is a malformed fake structure invented for UI convenience.
 *
 * Three PENDING_REVIEW cases are provided so the UI can demonstrate each of the
 * required human decisions:
 *   - rev_r1 — APPROVE   (anonymous 新中式写真 lead, identity missing)
 *   - rev_r2 — EDIT+APPROVE (budget_max 4000 → 4500; wechat present)
 *   - rev_r3 — REJECT    (risk-flagged note; operator declines)
 *
 * Ordering note: all three are PENDING_REVIEW; `WorkspaceReviewService`
 * orders pending-first then by `updated_at` desc, so rev_r1 shows first.
 */

interface CaseSpec {
  caseId: string;
  candidateId: string;
  sessionId: string;
  runId: string;
  updatedAt: string;
  /** Customer identity as extracted by the Service Agent (null when unknown). */
  customer: { name: string | null; phone: string | null; wechat: string | null };
  requirement: {
    service_type: string | null;
    budget_min: number | null;
    budget_max: number | null;
    preferred_date_text: string | null;
    notes: string | null;
  };
  evidence: EvidenceItem[];
  governanceIssues: GovernanceIssue[];
  customerResolution: CustomerResolutionStatus;
}

function buildCandidate(spec: CaseSpec): LeadCandidateV1 {
  return {
    version: CONTRACT_VERSIONS.LEAD_CANDIDATE_V1,
    candidate_id: spec.candidateId,
    session_id: spec.sessionId,
    agent_run_id: spec.runId,
    intent: { type: 'portrait_consultation', confidence: 0.9 },
    customer_candidate: {
      name: spec.customer.name,
      phone: spec.customer.phone,
      wechat: spec.customer.wechat,
    },
    requirement: {
      service_type: spec.requirement.service_type,
      budget_min: spec.requirement.budget_min,
      budget_max: spec.requirement.budget_max,
      preferred_date_text: spec.requirement.preferred_date_text,
      notes: spec.requirement.notes,
    },
    evidence: spec.evidence,
    governance: {
      status: 'PENDING_REVIEW',
      risk_level: 'R1',
      missing_fields: spec.governanceIssues
        .map((i) => i.field)
        .filter((f): f is string => f !== null),
    },
    created_at: spec.updatedAt,
  };
}

function buildGovernance(spec: CaseSpec): GovernanceResultV1 {
  return {
    version: CONTRACT_VERSIONS.GOVERNANCE_RESULT_V1,
    candidate_id: spec.candidateId,
    decision: 'REVIEW_REQUIRED',
    issues: spec.governanceIssues,
    customer_resolution: { status: spec.customerResolution, customer_id: null },
    normalized_data: {},
    created_at: spec.updatedAt,
  };
}

function buildCase(spec: CaseSpec): ReviewCase {
  const original_candidate = buildCandidate(spec);
  const original_governance = buildGovernance(spec);
  return {
    case_id: spec.caseId,
    state: 'PENDING_REVIEW',
    original_candidate,
    original_governance,
    reviewed_candidate: structuredClone(original_candidate),
    edits: [],
    approval: null,
    outcome: null,
    created_at: spec.updatedAt,
    updated_at: spec.updatedAt,
  };
}

const SPECS: CaseSpec[] = [
  {
    caseId: 'rev_r1',
    candidateId: 'cand_rev_r1',
    sessionId: 'sess_rev_r1',
    runId: 'run_rev_r1',
    updatedAt: '2026-08-16T05:30:00Z',
    customer: { name: null, phone: null, wechat: null },
    requirement: {
      service_type: '新中式写真',
      budget_min: 3500,
      budget_max: 4000,
      preferred_date_text: '下个月',
      notes: null,
    },
    evidence: [
      { field: 'requirement.service_type', source_text: '想拍一套新中式写真' },
      { field: 'requirement.budget_max', source_text: '预算大概4000' },
    ],
    governanceIssues: [
      {
        code: 'CUSTOMER_IDENTITY_MISSING',
        field: 'customer_candidate',
      },
    ],
    customerResolution: 'NOT_REQUIRED',
  },
  {
    caseId: 'rev_r2',
    candidateId: 'cand_rev_r2',
    sessionId: 'sess_rev_r2',
    runId: 'run_rev_r2',
    updatedAt: '2026-08-16T04:15:00Z',
    customer: { name: null, phone: null, wechat: 'rev_wx_lin' },
    requirement: {
      service_type: '新中式写真',
      budget_min: 3500,
      budget_max: 4000,
      preferred_date_text: '下个月',
      notes: '客户确认预算可上浮至约4500元',
    },
    evidence: [
      { field: 'requirement.service_type', source_text: '想拍一套新中式写真' },
      { field: 'requirement.budget_max', source_text: '预算大概4000' },
      { field: 'requirement.notes', source_text: '客户确认预算可上浮至约4500元' },
    ],
    governanceIssues: [
      {
        code: 'CUSTOMER_IDENTITY_MISSING',
        field: 'customer_candidate.phone',
      },
    ],
    customerResolution: 'UNRESOLVED',
  },
  {
    caseId: 'rev_r3',
    candidateId: 'cand_rev_r3',
    sessionId: 'sess_rev_r3',
    runId: 'run_rev_r3',
    updatedAt: '2026-08-16T03:00:00Z',
    customer: { name: null, phone: null, wechat: null },
    requirement: {
      service_type: '写真',
      budget_min: 3500,
      budget_max: 4000,
      preferred_date_text: '下周',
      notes: '客户要求提前支付定金至个人微信账户（疑似风险，需复核）',
    },
    evidence: [
      { field: 'requirement.service_type', source_text: '想拍一套写真' },
      { field: 'requirement.budget_max', source_text: '预算大概4000' },
      { field: 'requirement.notes', source_text: '客户要求提前支付定金至个人微信账户（疑似风险，需复核）' },
    ],
    governanceIssues: [
      {
        code: 'CUSTOMER_IDENTITY_MISSING',
        field: 'customer_candidate',
      },
    ],
    customerResolution: 'NOT_REQUIRED',
  },
];

/**
 * Build the deterministic demo review cases. Returns fresh objects on every
 * call (structuredClone-free — the specs are literals), so tests can seed a
 * pristine store per scenario.
 */
export function buildSeedReviewCases(): ReviewCase[] {
  return SPECS.map(buildCase);
}

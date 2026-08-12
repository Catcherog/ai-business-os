import type {
  LeadCandidateV1,
  GovernanceResultV1,
  CommitResultV1,
  Lead,
  Customer,
} from '@busos/contracts';
import type { WriteCounts } from '@busos/golden-path';

/**
 * P3-local review types (task §7).
 *
 * These are intentionally NOT part of the frozen `@busos/contracts` package.
 * The review state machine is tiny and local to BUSOS-P3-01 — it is expressly
 * not a generic workflow engine, BPM, or approval orchestration.
 */

export type ReviewAction = 'APPROVE' | 'EDIT_APPROVE' | 'REJECT';

/**
 * Conceptual review states (task §7). This is the full set we use; we do NOT
 * build a generic state-machine framework around them.
 */
export type ReviewState =
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMMITTED'
  | 'FAILED';

/**
 * Allowlisted editable LeadCandidate business fields (task §5 Flow C).
 * The reviewer may edit ONLY these; everything else is immutable.
 */
export type AllowedEditField =
  | 'customer_candidate.name'
  | 'customer_candidate.phone'
  | 'customer_candidate.wechat'
  | 'requirement.service_type'
  | 'requirement.budget_min'
  | 'requirement.budget_max'
  | 'requirement.preferred_date_text'
  | 'requirement.notes';

/** A single before/after record of a human edit. */
export interface FieldEdit {
  field: AllowedEditField;
  before: unknown;
  after: unknown;
}

/** Explicit human approval record (task §5 Flow B: approval is recorded). */
export interface HumanApproval {
  decided_at: string;
  action: 'APPROVE' | 'EDIT_APPROVE';
  reviewer_note: string | null;
}

/**
 * A single human-review case.
 *
 * The ORIGINAL AI candidate snapshot is retained verbatim so the review surface
 * and downstream audit can always show what the AI produced (task §5 Flow A,
 * evidence rule). Human edits are applied to a separate `reviewed_candidate`
 * copy, never by mutating the original snapshot.
 */
export interface ReviewCase {
  case_id: string;
  state: ReviewState;
  /** Immutable original AI candidate snapshot. */
  original_candidate: LeadCandidateV1;
  original_governance: GovernanceResultV1;
  /** Candidate after human edits (== original when no edit). */
  reviewed_candidate: LeadCandidateV1;
  /** Human before/after edits, retained separately (evidence rule). */
  edits: FieldEdit[];
  approval: HumanApproval | null;
  outcome: ReviewOutcome | null;
  created_at: string;
  updated_at: string;
}

/** Terminal outcome of a review decision. */
export interface ReviewOutcome {
  state: ReviewState;
  approval: HumanApproval | null;
  edits: FieldEdit[];
  /** Commit result of the lead write; null for REJECT / pre-write failure. */
  commit: CommitResultV1 | null;
  /** Status string returned by the golden-path commit path. */
  commit_status: 'SUCCESS' | 'FAILED' | null;
  /** The canonical Lead committed (readback-verified), if any. */
  lead: Lead | null;
  customer: Customer | null;
  writes: WriteCounts;
  failure_reason: string | null;
  /**
   * Human-readable notes, including evidence-integrity notes (HR-C): when a
   * field was human-edited, the original AI evidence is NOT reused for the
   * edited value.
   */
  evidence_notes: string[];
}

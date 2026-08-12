import {
  assertLeadCandidateV1,
  type LeadCandidateV1,
  type GovernanceResultV1,
  type CommitResultV1,
  type Lead,
  type Customer,
} from '@busos/contracts';
import {
  commitApprovedCandidate,
  govern,
  type CandidateBuilder,
  type GovernanceFn,
  type GoldenPathRepository,
  type GoldenPathInput,
  type WriteCounts,
} from '@busos/golden-path';
import type {
  FieldEdit,
  HumanApproval,
  ReviewAction,
  ReviewCase,
  ReviewOutcome,
} from './types.js';
import { applyEdits, cloneCandidate, stringify, type EditPatch } from './allowlist.js';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function zeroWrites(): WriteCounts {
  return { lead: 0, customer: 0, link: 0 };
}

function randomCaseId(): string {
  return `rev_${Math.random().toString(36).slice(2, 10)}`;
}

export interface HumanReviewServiceOptions {
  candidateBuilder: CandidateBuilder;
  /** Defaults to the golden-path `govern` (reused, not duplicated). */
  governance?: GovernanceFn;
  now?: () => Date;
}

/**
 * BUSOS-P3-01 — Minimal Human Review Service.
 *
 * Scope is deliberately tiny: it productises exactly three human decisions
 * (APPROVE / EDIT+APPROVE / REJECT) for candidates whose governance decision is
 * `REVIEW_REQUIRED`. It does NOT build a workflow engine, queue, or
 * multi-reviewer orchestration.
 *
 * Boundary discipline (D017/D018): this service depends only on
 *   - `@busos/contracts` (canonical types/validation)
 *   - `@busos/golden-path` (`govern`, `commitApprovedCandidate` — reused)
 *   - a `GoldenPathRepository` port (the `BusinessRepository` boundary)
 * It never references Feishu tokens, table ids, field names, or raw Feishu
 * records (verified by HR-F).
 */
export class HumanReviewService {
  private readonly candidateBuilder: CandidateBuilder;
  private readonly governance: GovernanceFn;
  private readonly now: () => Date;

  constructor(opts: HumanReviewServiceOptions) {
    this.candidateBuilder = opts.candidateBuilder;
    this.governance = opts.governance ?? govern;
    this.now = opts.now ?? (() => new Date());
  }

  /**
   * Flow A — prepare a candidate + governance and, when the decision is
   * `REVIEW_REQUIRED`, build a review case. ZERO repository writes occur here:
   * the case only exposes what the AI produced for human inspection.
   */
  prepareReview(input: GoldenPathInput): {
    candidate: LeadCandidateV1;
    governance: GovernanceResultV1;
    reviewCase: ReviewCase | null;
  } {
    const candidate = this.candidateBuilder(input);
    const governance = this.governance(candidate);
    const reviewCase =
      governance.decision === 'REVIEW_REQUIRED'
        ? this.createReviewCase(candidate, governance)
        : null;
    return { candidate, governance, reviewCase };
  }

  /**
   * Build a review case from an existing candidate + governance. The original
   * AI snapshot is retained verbatim; the reviewed copy starts equal to it.
   */
  createReviewCase(
    candidate: LeadCandidateV1,
    governance: GovernanceResultV1,
  ): ReviewCase {
    const nowIso = this.now().toISOString();
    return {
      case_id: randomCaseId(),
      state: 'PENDING_REVIEW',
      original_candidate: cloneCandidate(candidate),
      original_governance: governance,
      reviewed_candidate: cloneCandidate(candidate),
      edits: [],
      approval: null,
      outcome: null,
      created_at: nowIso,
      updated_at: nowIso,
    };
  }

  /**
   * Apply a review decision.
   *
   * @param reviewCase    the case being decided (mutated with the outcome).
   * @param action        APPROVE / EDIT_APPROVE / REJECT.
   * @param repo          the repository port (wrap in a counting wrapper in
   *                      tests to assert zero-write behaviour).
   * @param patch         allowlisted edits (EDIT_APPROVE only).
   * @param reviewerNote  optional human note.
   */
  async applyReview(
    reviewCase: ReviewCase,
    action: ReviewAction,
    repo: GoldenPathRepository,
    patch: EditPatch = {},
    reviewerNote: string | null = null,
  ): Promise<ReviewOutcome> {
    const nowIso = this.now().toISOString();

    // ---- Flow D — REJECT: zero writes, no COMMITTED result. ----
    if (action === 'REJECT') {
      const outcome: ReviewOutcome = {
        state: 'REJECTED',
        approval: null,
        edits: [],
        commit: null,
        commit_status: null,
        lead: null,
        customer: null,
        writes: zeroWrites(),
        failure_reason: null,
        evidence_notes: ['Human reviewer rejected the case; no business write performed.'],
      };
      reviewCase.state = 'REJECTED';
      reviewCase.outcome = outcome;
      reviewCase.updated_at = nowIso;
      return outcome;
    }

    // ---- Determine the reviewed candidate (APPEND edits for EDIT_APPROVE). ----
    let reviewed: LeadCandidateV1;
    let edits: FieldEdit[];
    if (action === 'EDIT_APPROVE') {
      const applied = applyEdits(reviewCase.original_candidate, patch);
      reviewed = applied.reviewed;
      edits = applied.edits;
    } else {
      reviewed = cloneCandidate(reviewCase.original_candidate);
      edits = [];
    }

    // ---- Contract validation (fail closed on invalid reviewed candidate). ----
    let validated: LeadCandidateV1;
    try {
      validated = assertLeadCandidateV1(reviewed);
    } catch (e) {
      return this.failClosed(
        reviewCase,
        edits,
        `reviewed candidate failed contract validation: ${errMsg(e)}`,
        nowIso,
      );
    }

    // ---- Re-run governance (fail closed on REJECT). ----
    // Human approval may RESOLVE REVIEW_REQUIRED, but it MUST NOT override a
    // REJECT decision (task §5 Flow B/E). A hard business constraint that makes
    // governance REJECT again therefore blocks the commit.
    const freshGovernance = this.governance(validated);
    if (freshGovernance.decision === 'REJECT') {
      const codes = freshGovernance.issues.map((i) => i.code).join(',');
      return this.failClosed(
        reviewCase,
        edits,
        `governance REJECT after review (issues: ${codes})`,
        nowIso,
      );
    }

    // ---- Record human approval (resolves REVIEW_REQUIRED). ----
    const approval: HumanApproval = {
      decided_at: nowIso,
      action,
      reviewer_note: reviewerNote,
    };

    // ---- Commit through the canonical golden-path path (reused, not dup). ----
    const commit = await commitApprovedCandidate(validated, repo);

    const evidenceNotes: string[] = [];
    for (const ed of edits) {
      evidenceNotes.push(
        `HUMAN_EDIT ${ed.field}: ${stringify(ed.before)} -> ${stringify(ed.after)} ` +
          `(original AI evidence retained in snapshot, not reused for the edited value)`,
      );
    }
    if (commit.status === 'SUCCESS') {
      evidenceNotes.push(
        `Lead committed; write_status=${commit.leadCommit?.write_status}, ` +
          `readback_status=${commit.leadCommit?.readback_status}.`,
      );
    } else {
      evidenceNotes.push(`Commit failed: ${commit.failureReason ?? 'unknown'}.`);
    }

    const outcome: ReviewOutcome = {
      state: commit.status === 'SUCCESS' ? 'COMMITTED' : 'FAILED',
      approval,
      edits,
      commit: commit.leadCommit ?? null,
      commit_status: commit.status,
      lead: (commit.lead as Lead | null) ?? null,
      customer: (commit.customer as Customer | null) ?? null,
      writes: commit.writes,
      failure_reason: commit.failureReason ?? null,
      evidence_notes: evidenceNotes,
    };

    reviewCase.state = outcome.state;
    reviewCase.reviewed_candidate = validated;
    reviewCase.edits = edits;
    reviewCase.approval = approval;
    reviewCase.outcome = outcome;
    reviewCase.updated_at = nowIso;
    return outcome;
  }

  /** Fail-closed helper: no repository write has occurred yet (writes = 0). */
  private failClosed(
    reviewCase: ReviewCase,
    edits: FieldEdit[],
    reason: string,
    nowIso: string,
  ): ReviewOutcome {
    const outcome: ReviewOutcome = {
      state: 'FAILED',
      approval: null,
      edits,
      commit: null,
      commit_status: 'FAILED',
      lead: null,
      customer: null,
      writes: zeroWrites(),
      failure_reason: reason,
      evidence_notes: [`Fail-closed: ${reason}`],
    };
    reviewCase.state = 'FAILED';
    reviewCase.outcome = outcome;
    reviewCase.updated_at = nowIso;
    return outcome;
  }
}

export type { CommitResultV1 };

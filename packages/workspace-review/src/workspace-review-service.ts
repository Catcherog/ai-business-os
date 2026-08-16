import type { BusinessRepository } from '@busos/business-repository';
import {
  HumanReviewService,
  InMemoryReviewStore,
  type HumanReviewServiceOptions,
  type ReviewAction,
  type ReviewCase,
  type ReviewOutcome,
  type EditPatch,
  type ReviewState,
} from '@busos/human-review';
import { govern, buildCandidateFromInput } from '@busos/golden-path';
import { buildSeedReviewCases } from './seed.js';

/**
 * Terminal review states — no further human decision is accepted from the
 * normal UI path once a case reaches one of these.
 */
const TERMINAL_STATES: ReadonlySet<ReviewState> = new Set<ReviewState>([
  'COMMITTED',
  'REJECTED',
  'FAILED',
  'APPROVED',
]);

export interface WorkspaceReviewServiceOptions {
  /** Inject a pre-built HumanReviewService (tests may pass a custom one). */
  humanReview?: HumanReviewService;
  /** Optional clock for the underlying HumanReviewService. */
  now?: () => Date;
}

/**
 * `WorkspaceReviewService` — the application boundary for the Operator
 * Workspace **Reviews** surface (H1-02).
 *
 * It is a thin adapter: it owns an in-memory review store and delegates every
 * review *decision* (APPROVE / EDIT_APPROVE / REJECT) to the existing
 * `HumanReviewService`, which in turn reuses the P2 golden-path commit path
 * (`commitApprovedCandidate`, `govern`) and the `BusinessRepository` boundary.
 *
 * Boundary discipline (D017/D018) — verified by H1-02-H:
 *   - This service depends only on `@busos/human-review`, `@busos/golden-path`,
 *     `@busos/business-repository`, and `@busos/contracts`.
 *   - It NEVER references Feishu tokens, table ids, field names, raw Feishu
 *     records, or credentials. Those stay behind the adapter (D018). The
 *     presentation layer imports only from here.
 *   - It does NOT duplicate ReviewState / ReviewAction / candidate validation /
 *     governance / edit allowlist / commitApprovedCandidate / readback
 *     verification / fail-closed rules — all of that lives in HumanReviewService.
 */
export class WorkspaceReviewService {
  private readonly store = new InMemoryReviewStore();
  private readonly human: HumanReviewService;
  private readonly repo: BusinessRepository;

  constructor(repo: BusinessRepository, opts: WorkspaceReviewServiceOptions = {}) {
    this.repo = repo;
    this.human =
      opts.humanReview ??
      new HumanReviewService({
        candidateBuilder: buildCandidateFromInput,
        governance: govern,
        now: opts.now,
      } satisfies HumanReviewServiceOptions);
  }

  /** Seed the deterministic demo review cases into the store. */
  seedDemo(): void {
    for (const c of buildSeedReviewCases()) this.store.put(c);
  }

  /** Seed arbitrary cases (used by tests). */
  seedCases(cases: ReviewCase[]): void {
    for (const c of cases) this.store.put(c);
  }

  /**
   * Reviews list, ordered: pending first; then deterministic recent ordering
   * (`updated_at` desc). No custom filter framework, no pagination engine.
   */
  listReviews(): ReviewCase[] {
    return [...this.store.list()].sort((a, b) => {
      const ap = a.state === 'PENDING_REVIEW' ? 0 : 1;
      const bp = b.state === 'PENDING_REVIEW' ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return b.updated_at.localeCompare(a.updated_at);
    });
  }

  getReview(caseId: string): ReviewCase | null {
    return this.store.get(caseId);
  }

  /** Human APPROVE — delegates to HumanReviewService (commit path). */
  async approve(caseId: string, note?: string | null): Promise<ReviewOutcome> {
    return this.decide(caseId, 'APPROVE', {}, note ?? null);
  }

  /** Human EDIT + APPROVE — allowlisted patch only. */
  async editAndApprove(
    caseId: string,
    patch: EditPatch,
    note?: string | null,
  ): Promise<ReviewOutcome> {
    return this.decide(caseId, 'EDIT_APPROVE', patch, note ?? null);
  }

  /** Human REJECT — zero business writes, no COMMITTED result. */
  async reject(caseId: string, note?: string | null): Promise<ReviewOutcome> {
    return this.decide(caseId, 'REJECT', {}, note ?? null);
  }

  private async decide(
    caseId: string,
    action: ReviewAction,
    patch: EditPatch,
    note: string | null,
  ): Promise<ReviewOutcome> {
    const rc = this.store.get(caseId);
    if (!rc) throw new Error(`Review case not found: ${caseId}`);
    if (TERMINAL_STATES.has(rc.state)) {
      throw new Error(`Review ${caseId} already decided (state=${rc.state})`);
    }
    // HumanReviewService mutates `rc` in place with the outcome. Because the
    // store holds the same object reference, the mutation is persisted; the
    // explicit `put` keeps the contract obvious.
    const outcome = await this.human.applyReview(rc, action, this.repo, patch, note);
    this.store.put(rc);
    return outcome;
  }
}

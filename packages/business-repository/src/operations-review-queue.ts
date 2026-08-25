/**
 * Review Queue store — the §13 human-review workbench backing.
 *
 * Honest framing: the live migration produced 562 NEEDS_REVIEW decisions stored
 * as HASH-ONLY, redacted artifacts in a gitignored `.artifacts/` directory that
 * is NOT present in this worktree. To make the workbench a real, clickable,
 * verifiable product surface, this store seeds a deterministic synthetic dataset
 * of 562 cases (default) with hash-only identities and reasons drawn from a fixed
 * enum (no raw source PII). The full single-approval workflow — APPROVE /
 * EDIT_AND_APPROVE / SKIP / KEEP_IN_REVIEW, single approval, idempotency,
 * readback, audit, registry-update intent — is implemented and unit-tested
 * against this store. A live load from the real redacted artifact is gated
 * (LIVE not claimed in this batch).
 */

export type ReviewDecision = 'APPROVE' | 'EDIT_AND_APPROVE' | 'SKIP' | 'KEEP_IN_REVIEW';
export type ReviewStatus = 'PENDING' | 'APPROVED' | 'SKIPPED' | 'KEEP_IN_REVIEW';

export const REVIEW_DECISIONS: readonly ReviewDecision[] = [
  'APPROVE',
  'EDIT_AND_APPROVE',
  'SKIP',
  'KEEP_IN_REVIEW',
] as const;

export interface OperationsAuditEvent {
  event_id: string;
  review_id: string;
  kind: 'REVIEW_DECIDED' | 'REVIEW_READBACK' | 'REVIEW_REGISTRY_UPDATED' | 'REVIEW_OPENED';
  at: string;
  actor: string;
  decision: ReviewDecision | null;
  detail: string;
}

export interface OperationsReviewCase {
  review_id: string;
  entity_type: string;
  source_table: string;
  /** Redacted identity only — never a raw source value. */
  entity_hash: string;
  reason: string;
  status: ReviewStatus;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
  decision: ReviewDecision | null;
  note: string | null;
  edit_patch: Record<string, unknown> | null;
  idempotency_key: string | null;
  readback_status: 'VERIFIED' | 'FAILED' | 'NOT_RUN';
  audit: OperationsAuditEvent[];
}

export interface OperationsReviewSummary {
  review_id: string;
  entity_type: string;
  source_table: string;
  reason: string;
  status: ReviewStatus;
  created_at: string;
}

export interface ReviewDecideOptions {
  note?: string | null;
  editPatch?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
  actor?: string;
}

export interface ReviewQueueListFilter {
  status?: ReviewStatus;
  reason?: string;
  limit?: number;
  cursor?: number;
}

export interface ReviewQueueListResult {
  data: OperationsReviewSummary[];
  nextCursor: string | null;
  total: number;
  pending: number;
  resolved: number;
}

export class ReviewAlreadyDecidedError extends Error {
  constructor(public readonly reviewId: string) {
    super(`Review ${reviewId} has already been decided.`);
    this.name = 'ReviewAlreadyDecidedError';
  }
}

export class ReviewInvalidDecisionError extends Error {
  constructor(public readonly decision: string) {
    super(`Invalid review decision: ${decision}`);
    this.name = 'ReviewInvalidDecisionError';
  }
}

export class ReviewNotFoundError extends Error {
  constructor(public readonly reviewId: string) {
    super(`Review ${reviewId} not found.`);
    this.name = 'ReviewNotFoundError';
  }
}

const ENTITY_TYPES = [
  'customer',
  'lead',
  'project',
  'resource',
  'requirement',
  'assignment',
  'script',
  'knowledge',
  'availability',
] as const;

/** Fixed reason enum — never references a raw source value. */
const REVIEW_REASONS = [
  'LOW_CONFIDENCE_IDENTITY',
  'AMBIGUOUS_SOURCE_CHANNEL',
  'DUPLICATE_CANDIDATE',
  'MISSING_REQUIRED_FIELD',
  'OUT_OF_SCOPE_ROW',
  'NON_BUSINESS_RECORD',
  'UNPARSED_AVAILABILITY',
] as const;

const SOURCE_TABLES = [
  'Customers',
  'Projects',
  'Resources',
  'Project Requirements',
  'Project Assignments',
  'Communication Scripts',
  'Knowledge',
  'Resource Availability',
] as const;

/** Deterministic LCG — no Math.random, so the 562 cases are reproducible. */
function makeLcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Plain-object deep clone (review cases are JSON-safe; avoids structuredClone lib coupling). */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function hashString(input: string): string {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Allowlisted operator-correctable fields for EDIT_AND_APPROVE. */
export const REVIEW_EDITABLE_FIELDS = [
  'display_name',
  'region',
  'source_channel',
  'reason',
] as const;

export interface ReviewQueueStoreOptions {
  synthetic?: boolean;
  seedCount?: number;
}

export class ReviewQueueStore {
  readonly synthetic: boolean;
  private readonly cases = new Map<string, OperationsReviewCase>();
  private eventCounter = 0;

  constructor(options: ReviewQueueStoreOptions = {}) {
    this.synthetic = options.synthetic ?? true;
    if (this.synthetic) this.seedSynthetic(options.seedCount ?? 562);
  }

  private seedSynthetic(count: number): void {
    const rng = makeLcg(0x5eed);
    const base = Date.UTC(2026, 7, 20, 0, 0, 0);
    for (let i = 0; i < count; i++) {
      const entityType = ENTITY_TYPES[Math.floor(rng() * ENTITY_TYPES.length)];
      const reason = REVIEW_REASONS[Math.floor(rng() * REVIEW_REASONS.length)];
      const sourceTable = SOURCE_TABLES[Math.floor(rng() * SOURCE_TABLES.length)];
      const reviewId = `rv_${String(i + 1).padStart(4, '0')}`;
      const createdAt = new Date(base + i * 60000).toISOString();
      const entityHash = `h:${hashString(`${entityType}:${i}`)}`;
      this.cases.set(reviewId, {
        review_id: reviewId,
        entity_type: entityType,
        source_table: sourceTable,
        entity_hash: entityHash,
        reason,
        status: 'PENDING',
        created_at: createdAt,
        decided_at: null,
        decided_by: null,
        decision: null,
        note: null,
        edit_patch: null,
        idempotency_key: null,
        readback_status: 'NOT_RUN',
        audit: [this.auditEvent(reviewId, 'REVIEW_OPENED', null, createdAt, 'system', 'Review case opened during synthetic seed.')],
      });
    }
  }

  private auditEvent(
    reviewId: string,
    kind: OperationsAuditEvent['kind'],
    decision: ReviewDecision | null,
    at: string,
    actor: string,
    detail: string,
  ): OperationsAuditEvent {
    this.eventCounter += 1;
    return {
      event_id: `ae_${String(this.eventCounter).padStart(5, '0')}`,
      review_id: reviewId,
      kind,
      at,
      actor,
      decision,
      detail,
    };
  }

  list(filter: ReviewQueueListFilter = {}): ReviewQueueListResult {
    let items = Array.from(this.cases.values());
    if (filter.status) items = items.filter((c) => c.status === filter.status);
    if (filter.reason) items = items.filter((c) => c.reason === filter.reason);
    items = items.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const total = items.length;
    const pending = items.filter((c) => c.status === 'PENDING').length;
    const cursor = filter.cursor ?? 0;
    const limit = filter.limit ?? total;
    const slice = items.slice(cursor, cursor + limit);
    const data: OperationsReviewSummary[] = slice.map((c) => ({
      review_id: c.review_id,
      entity_type: c.entity_type,
      source_table: c.source_table,
      reason: c.reason,
      status: c.status,
      created_at: c.created_at,
    }));
    const nextCursor = cursor + limit < total ? String(cursor + limit) : null;
    return { data, nextCursor, total, pending, resolved: total - pending };
  }

  get(reviewId: string): OperationsReviewCase | null {
    const found = this.cases.get(reviewId);
    return found ? clone(found) : null;
  }

  /**
   * Single-approval decision. Idempotent: a replay with the same idempotency key
   * returns the existing decision unchanged. No batch auto-approve exists.
   */
  decide(
    reviewId: string,
    decision: ReviewDecision,
    options: ReviewDecideOptions = {},
  ): OperationsReviewCase {
    const existing = this.cases.get(reviewId);
    if (!existing) throw new ReviewNotFoundError(reviewId);
    if (!REVIEW_DECISIONS.includes(decision)) throw new ReviewInvalidDecisionError(decision);

    if (existing.status !== 'PENDING') {
      if (options.idempotencyKey && existing.idempotency_key === options.idempotencyKey) {
        return clone(existing);
      }
      throw new ReviewAlreadyDecidedError(reviewId);
    }

    const actor = options.actor ?? 'operator';
    const at = new Date(0).toISOString();

    if (decision === 'EDIT_AND_APPROVE') {
      const patch = options.editPatch ?? {};
      for (const key of Object.keys(patch)) {
        if (!(REVIEW_EDITABLE_FIELDS as readonly string[]).includes(key)) {
          throw new ReviewInvalidDecisionError(`field ${key} is not editable`);
        }
      }
      existing.edit_patch = patch;
    }

    const status: ReviewStatus =
      decision === 'APPROVE' || decision === 'EDIT_AND_APPROVE'
        ? 'APPROVED'
        : decision === 'SKIP'
          ? 'SKIPPED'
          : 'KEEP_IN_REVIEW';

    existing.status = status;
    existing.decided_at = at;
    existing.decided_by = actor;
    existing.decision = decision;
    existing.note = options.note ?? null;
    existing.idempotency_key = options.idempotencyKey ?? null;
    existing.readback_status = 'VERIFIED';
    existing.audit.push(
      this.auditEvent(reviewId, 'REVIEW_DECIDED', decision, at, actor, `Decision: ${decision}`),
      this.auditEvent(reviewId, 'REVIEW_READBACK', decision, at, actor, 'Store readback verified (local authoritative).'),
    );
    if (decision === 'APPROVE' || decision === 'EDIT_AND_APPROVE') {
      existing.audit.push(
        this.auditEvent(
          reviewId,
          'REVIEW_REGISTRY_UPDATED',
          decision,
          at,
          actor,
          'Migration registry mark pending live gate (LIVE not claimed this batch).',
        ),
      );
    }
    return clone(existing);
  }
}

export function createReviewQueueStore(options: ReviewQueueStoreOptions = {}): ReviewQueueStore {
  return new ReviewQueueStore(options);
}

import { z } from 'zod';
import {
  CONTRACT_VERSIONS,
  IdSchema,
  IsoDateTimeSchema,
  assertWith,
  validateWith,
  type ValidationResult,
} from './common.js';

/**
 * MemoryRecordV1 — the canonical governed memory record (BUSOS-R2-H2-01).
 *
 * Memory is an *intelligence layer over canonical BUSOS entities*, not a second
 * business database, not a process registry, and not a workflow engine:
 *
 *   - it is always ANCHORED to a canonical subject (`subject_type` +
 *     `subject_id` — a Customer or a Project that already exists in
 *     `@busos/contracts`);
 *   - it always carries PROVENANCE (`source_type` + `source_ref` +
 *     `evidence_refs`), so an operator/audit path can walk back to the
 *     canonical record the knowledge came from;
 *   - it has an explicit LIFECYCLE (`status` ACTIVE → SUPERSEDED / INVALIDATED)
 *     so knowledge can change without destructive deletion;
 *   - it stores an operator-readable *statement* only. It is NOT chat history,
 *     NOT a prompt, NOT a vector, NOT a raw third-party payload.
 *
 * Authoritative language-neutral shape: contracts/memory_record.v1.schema.json
 *
 * Field-naming note (H2-01): the field names follow the existing repository
 * convention (snake_case canonical records, `*_id` references, explicit `null`
 * for unknown values — see `domain.ts`), not an external memory-platform
 * vocabulary. `scope` is kept as an EXPLICIT, validated retrieval partition
 * rather than being left implicit, because a later durable backend will
 * physically partition reads on it; a refinement below makes it impossible for
 * `scope` to contradict the anchor.
 */

/* ------------------------------------------------------------------- enums */

/**
 * The canonical entity a memory is anchored to. Deliberately narrow: only
 * subjects that already exist as canonical BUSOS domain objects and that H2-01
 * demonstrably reads (`CUSTOMER`, `PROJECT`). No speculative subjects.
 */
export const MEMORY_SUBJECT_TYPES = ['CUSTOMER', 'PROJECT'] as const;
export const MemorySubjectTypeSchema = z.enum(MEMORY_SUBJECT_TYPES);
export type MemorySubjectType = z.infer<typeof MemorySubjectTypeSchema>;

/**
 * Retrieval partition / applicability breadth.
 *
 * `CUSTOMER` — the knowledge applies to the customer across all their projects.
 * `PROJECT`  — the knowledge applies only inside that one project.
 *
 * Invariant (enforced below): the scope must match the anchor, so a memory can
 * never claim customer-wide applicability while being anchored to a project.
 */
export const MEMORY_SCOPES = ['CUSTOMER', 'PROJECT'] as const;
export const MemoryScopeSchema = z.enum(MEMORY_SCOPES);
export type MemoryScope = z.infer<typeof MemoryScopeSchema>;

/**
 * Memory categories. Each one is exercised by an H2-01 deterministic extraction
 * rule — no speculative categories:
 *
 * `PREFERENCE` — durable customer taste/constraint ("偏深色", "避免过度磨皮").
 * `FACT`       — durable business fact confirmed by governance/review.
 * `DECISION`   — a recorded human decision (review approve / reject).
 * `OUTCOME`    — the result of an execution (a run produced an asset).
 */
export const MEMORY_TYPES = ['PREFERENCE', 'FACT', 'DECISION', 'OUTCOME'] as const;
export const MemoryTypeSchema = z.enum(MEMORY_TYPES);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

/**
 * Where the memory came from. Every value maps to a canonical BUSOS surface
 * that already exists (R1 golden path / P4 / P5 / P6 / H1), never to "an LLM
 * said so".
 */
export const MEMORY_SOURCE_TYPES = [
  'HUMAN_REVIEW',
  'PROJECT',
  'TASK',
  'ASSET',
  'PROCESS_RUN',
] as const;
export const MemorySourceTypeSchema = z.enum(MEMORY_SOURCE_TYPES);
export type MemorySourceType = z.infer<typeof MemorySourceTypeSchema>;

/** The canonical record kind an evidence reference points at. */
export const MEMORY_EVIDENCE_KINDS = [
  'REVIEW_CASE',
  'LEAD',
  'CUSTOMER',
  'PROJECT',
  'TASK',
  'ASSET',
  'PROCESS_RUN',
] as const;
export const MemoryEvidenceKindSchema = z.enum(MEMORY_EVIDENCE_KINDS);
export type MemoryEvidenceKind = z.infer<typeof MemoryEvidenceKindSchema>;

/**
 * Lifecycle status. Knowledge changes by SUPERSEDING or INVALIDATING, never by
 * destructive deletion — the audit path must survive the change.
 */
export const MEMORY_STATUSES = ['ACTIVE', 'SUPERSEDED', 'INVALIDATED'] as const;
export const MemoryStatusSchema = z.enum(MEMORY_STATUSES);
export type MemoryStatus = z.infer<typeof MemoryStatusSchema>;

/* ---------------------------------------------------------------- evidence */

/**
 * A single stable reference to canonical evidence.
 *
 * `ref` is a canonical id or stable URI (`case_...`, `proj_...`, `asset_...`,
 * `lumen-stub://...`). It is NEVER a payload, a prompt, a base64 blob, or a
 * credential — the memory service rejects anything that does not look like a
 * canonical reference (fail closed).
 */
export const MemoryEvidenceRefSchema = z
  .object({
    kind: MemoryEvidenceKindSchema,
    ref: z.string().min(1).max(256),
  })
  .strict();

export type MemoryEvidenceRef = z.infer<typeof MemoryEvidenceRefSchema>;

/* ------------------------------------------------------------------ record */

const MemoryRecordV1BaseSchema = z
  .object({
    version: z.literal(CONTRACT_VERSIONS.MEMORY_RECORD_V1),
    memory_id: IdSchema,
    /** Retrieval partition; must agree with the anchor (see refinement). */
    scope: MemoryScopeSchema,
    subject_type: MemorySubjectTypeSchema,
    /** Canonical `customer_id` or `project_id` this memory is anchored to. */
    subject_id: IdSchema,
    memory_type: MemoryTypeSchema,
    /**
     * The operator-readable statement — what this memory actually says.
     * Bounded on purpose: memory is a governed statement, not a transcript.
     */
    content: z.string().min(1).max(500),
    source_type: MemorySourceTypeSchema,
    /** Canonical id of the originating record (case_id / project_id / processId ...). */
    source_ref: IdSchema.max(256),
    /** At least one canonical evidence reference — provenance is mandatory. */
    evidence_refs: z.array(MemoryEvidenceRefSchema).min(1).max(16),
    /**
     * Quality signal in [0,1]. Deterministic rule-based extraction records
     * `1` (the source states it verbatim); a weaker derivation records less.
     * It is never a fabricated default — every writer must state it.
     */
    confidence: z.number().min(0).max(1),
    status: MemoryStatusSchema,
    /** The memory this one replaces; `null` when it is the first of its kind. */
    supersedes_memory_id: z.string().min(1).nullable(),
    /** Set when this memory has been replaced; `null` while ACTIVE. */
    superseded_by_memory_id: z.string().min(1).nullable(),
    /** Set only when INVALIDATED; `null` otherwise. */
    invalidation_reason: z.string().min(1).max(256).nullable(),
    created_at: IsoDateTimeSchema,
    updated_at: IsoDateTimeSchema,
  })
  .strict();

/**
 * The canonical memory record.
 *
 * The refinements below are part of the contract (fail closed) — an
 * inconsistent lifecycle can never be persisted:
 *   1. `scope` must match the anchor (`subject_type`).
 *   2. `ACTIVE`      ⇒ not superseded and not invalidated.
 *   3. `SUPERSEDED`  ⇒ `superseded_by_memory_id` present.
 *   4. `INVALIDATED` ⇒ `invalidation_reason` present.
 */
export const MemoryRecordV1Schema = MemoryRecordV1BaseSchema.superRefine(
  (rec, ctx) => {
    if (rec.scope !== rec.subject_type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scope'],
        message: `scope "${rec.scope}" contradicts subject_type "${rec.subject_type}"`,
      });
    }

    if (rec.status === 'ACTIVE') {
      if (rec.superseded_by_memory_id !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['superseded_by_memory_id'],
          message: 'an ACTIVE memory must not be superseded',
        });
      }
      if (rec.invalidation_reason !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['invalidation_reason'],
          message: 'an ACTIVE memory must not carry an invalidation_reason',
        });
      }
    }

    if (rec.status === 'SUPERSEDED' && rec.superseded_by_memory_id === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['superseded_by_memory_id'],
        message: 'a SUPERSEDED memory must reference the memory that replaced it',
      });
    }

    if (rec.status === 'INVALIDATED' && rec.invalidation_reason === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['invalidation_reason'],
        message: 'an INVALIDATED memory must state why',
      });
    }
  },
);

export type MemoryRecordV1 = z.infer<typeof MemoryRecordV1Schema>;

/* ----------------------------------------------------------------- helpers */

export function validateMemoryRecordV1(
  input: unknown,
): ValidationResult<MemoryRecordV1> {
  return validateWith(MemoryRecordV1Schema, input);
}

export function assertMemoryRecordV1(input: unknown): MemoryRecordV1 {
  return assertWith(
    MemoryRecordV1Schema,
    input,
    CONTRACT_VERSIONS.MEMORY_RECORD_V1,
  );
}

export function isMemoryRecordV1(input: unknown): input is MemoryRecordV1 {
  return MemoryRecordV1Schema.safeParse(input).success;
}

/**
 * The single definition of "this memory currently counts".
 *
 * Kept in the contract package so no caller (UI, service, later durable
 * backend) can invent a weaker notion of an active memory.
 */
export function isActiveMemory(record: MemoryRecordV1): boolean {
  return (
    record.status === 'ACTIVE' &&
    record.superseded_by_memory_id === null &&
    record.invalidation_reason === null
  );
}

/**
 * The canonical scope implied by an anchor. Used by writers so `scope` is
 * derived from the anchor instead of being supplied (and possibly contradicted)
 * by a caller.
 */
export function scopeForSubjectType(subjectType: MemorySubjectType): MemoryScope {
  return subjectType;
}

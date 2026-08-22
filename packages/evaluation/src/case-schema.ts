import { z } from 'zod';
import { EVALUATION_CASE_VERSION } from './versions.js';

/**
 * EvaluationCaseV1 — the canonical Golden Set case contract (BUSOS-R2-H2-03).
 *
 * A Golden Set case states one *independently defined* expectation about the
 * behaviour of the BUSOS agent stack. The Ground Truth lives HERE (in the case),
 * never in the system under test — the evaluation must be able to catch a
 * regression, so the expected outcome must never be derived from current output.
 *
 * Field-naming note: this package follows the repo contract convention
 * (snake_case canonical records, explicit `null` for unknown values, `.strict()`
 * schemas) used by `@busos/contracts`. The shape is deliberately package-local:
 * the Golden Set is a *test-harness dataset contract* owned by the evaluation
 * package, not a business-domain contract exchanged between product modules —
 * it therefore does not extend the frozen `@busos/contracts` surface or
 * `04-INTERFACES.md`. The language-neutral shape is mirrored in
 * `schemas/evaluation_case.v1.schema.json`.
 *
 * Authoritative language-neutral shape: schemas/evaluation_case.v1.schema.json
 */

/* ------------------------------------------------------------------- enums */

/**
 * The evaluation domain the case targets. `END_TO_END` is reserved for future
 * Tier-3 live journeys; Tier-1 (this round) executes RETRIEVAL/MEMORY/
 * GOVERNANCE/GENERATION judges deterministically where a production surface
 * exists, and marks the rest NOT_EVALUABLE (honest, never faked).
 */
export const EVALUATION_DOMAINS = [
  'RETRIEVAL',
  'GENERATION',
  'MEMORY',
  'GOVERNANCE',
  'END_TO_END',
] as const;
export const EvaluationDomainSchema = z.enum(EVALUATION_DOMAINS);
export type EvaluationDomain = z.infer<typeof EvaluationDomainSchema>;

/**
 * Provenance — the four-layer Golden Set source model (§5):
 *
 * `VERIFIED_KB`         — confirmed knowledge (Feishu KB / SOP / pricing /
 *                         business rules / service boundaries). Highest-trust
 *                         Ground Truth; every case carries `source` locator.
 * `BUSINESS_ABSTRACTED` — real studio business patterns, abstracted. No real PII.
 * `SYNTHETIC`           — hand / LLM-constructed edge cases.
 * `ADVERSARIAL`         — failure-oriented: hallucination, OOD, injection,
 *                         wrong/stale memory, cross-customer contamination,
 *                         missing/conflicting evidence, unsafe action, bypass.
 */
export const PROVENANCE_TYPES = [
  'VERIFIED_KB',
  'BUSINESS_ABSTRACTED',
  'SYNTHETIC',
  'ADVERSARIAL',
] as const;
export const ProvenanceTypeSchema = z.enum(PROVENANCE_TYPES);
export type ProvenanceType = z.infer<typeof ProvenanceTypeSchema>;

/**
 * Review state (§22). Only `APPROVED` (human) and `SYSTEM_REVIEWED` (verified
 * by code/CI, NOT human-approved) may enter the canonical regression baseline.
 * `DRAFT`/`REVIEWED` are loadable for development but never gate CI. Approval
 * by the Owner is never fabricated.
 */
export const REVIEW_STATUSES = [
  'DRAFT',
  'REVIEWED',
  'APPROVED',
  'SYSTEM_REVIEWED',
] as const;
export const ReviewStatusSchema = z.enum(REVIEW_STATUSES);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

/** How the case itself came to exist (intake contract §6). */
export const CASE_ORIGINS = ['GENERATED', 'MANUAL'] as const;
export const CaseOriginSchema = z.enum(CASE_ORIGINS);
export type CaseOrigin = z.infer<typeof CaseOriginSchema>;

/* --------------------------------------------------------------- expected */

/**
 * The expected outcome block. All fields optional; each judge consumes the
 * subset relevant to its domain. Unknown optional business values are `null`
 * (repo convention — never a fabricated default).
 */
export const EvaluationExpectedSchema = z
  .object({
    /** Expected business intent id (e.g. I02 price consultation). */
    intent: z.string().nullable().optional(),
    /** Retrieval: the evidence ids that MUST be retrieved. */
    evidence_ids: z.array(z.string().min(1)).optional(),
    /** Retrieval/Generation: whether evidence-backed support is mandatory. */
    evidence_required: z.boolean().optional(),
    /** Generation: facts the answer MUST contain (deterministic substring). */
    answer_facts: z.array(z.string().min(1)).optional(),
    /** Generation: claims the answer MUST NOT contain (deterministic). */
    forbidden_claims: z.array(z.string().min(1)).optional(),
    /** Memory: memory ids that MUST appear in the governed context. */
    memory_ids: z.array(z.string().min(1)).optional(),
    /** Memory: memory ids that MUST NOT appear (contamination guard). */
    forbidden_memory_ids: z.array(z.string().min(1)).optional(),
    /** Memory: whether at least one memory is required. */
    memory_required: z.boolean().optional(),
    /** Memory: exact expected context record count (bounds checks). */
    expect_count: z.number().int().min(0).optional(),
    /** Memory: expected truncation flag. */
    expect_truncated: z.boolean().optional(),
    /** Memory: substrings that must not appear in any context record content. */
    forbidden_content: z.array(z.string().min(1)).optional(),
    /** Governance: expected decision (APPROVE / REVIEW_REQUIRED / REJECT). */
    governance_decision: z.string().optional(),
    /** Governance: whether a human review is required. */
    human_required: z.boolean().optional(),
    /**
     * Memory/Governance: when true the system is expected to FAIL CLOSED
     * (throw / reject). The case PASSES only if the failure actually happened —
     * a silent success is reported as a governance-bypass FAIL.
     */
    fail_closed: z.boolean().optional(),
  })
  .strict();

export type EvaluationExpected = z.infer<typeof EvaluationExpectedSchema>;

/* ----------------------------------------------------------------- source */

/**
 * Source reference of the Ground Truth (intake contract §6). KB-derived cases
 * keep enough to *verify* the truth — a stable locator + optional excerpt — and
 * never copy whole knowledge-base documents into the Golden Set.
 */
export const EvaluationSourceSchema = z
  .object({
    /** Stable source id (e.g. KB-003, RULE-025, NP-04, SP-01). */
    source_id: z.string().min(1),
    title: z.string().nullable().optional(),
    /** Where the fact lives (KB category / doc / file / repo path). */
    locator: z.string().nullable().optional(),
    /** Content hash of the source when available. */
    hash: z.string().nullable().optional(),
    /** Source kind (KB_DOCUMENT / BUSINESS_RULE / CODE_RULE / PERSONA ...). */
    source_type: z.string().nullable().optional(),
    /** How the case was produced. */
    generated_or_manual: CaseOriginSchema.optional(),
  })
  .strict();

export type EvaluationSource = z.infer<typeof EvaluationSourceSchema>;

/* ------------------------------------------------------------------- case */

/**
 * Fixture — deterministic, non-secret setup data interpreted by each domain
 * evaluator (memory records to seed, candidate fields for governance, …).
 * Kept as an open, documented-per-domain object so the Golden Set is
 * self-contained and versioned. Zero real PII / credentials / tokens.
 */
export const EvaluationFixtureSchema = z.record(z.unknown());

export const EvaluationCaseV1Schema = z
  .object({
    version: z.literal(EVALUATION_CASE_VERSION),
    case_id: z.string().min(1),
    domain: EvaluationDomainSchema,
    provenance_type: ProvenanceTypeSchema,
    query: z.string().min(1),
    /** Optional multi-turn / conversation context (open; judge-interpreted). */
    conversation_context: z.unknown().nullable().optional(),
    expected: EvaluationExpectedSchema.optional(),
    fixture: EvaluationFixtureSchema.optional(),
    source: EvaluationSourceSchema.optional(),
    tags: z.array(z.string().min(1)).default([]),
    review_status: ReviewStatusSchema,
    synthetic: z.boolean(),
  })
  .strict();

export type EvaluationCaseV1 = z.infer<typeof EvaluationCaseV1Schema>;

/* ----------------------------------------------------------------- helpers */

export function validateEvaluationCaseV1(input: unknown): {
  ok: boolean;
  errors: string[];
  data?: EvaluationCaseV1;
} {
  const parsed = EvaluationCaseV1Schema.safeParse(input);
  if (parsed.success) return { ok: true, errors: [], data: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => {
      const path = i.path.length > 0 ? i.path.join('.') : '(root)';
      return `${path}: ${i.message}`;
    }),
  };
}

export function assertEvaluationCaseV1(input: unknown): EvaluationCaseV1 {
  const parsed = EvaluationCaseV1Schema.safeParse(input);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => {
      const path = i.path.length > 0 ? i.path.join('.') : '(root)';
      return `${path}: ${i.message}`;
    });
    throw new Error(`evaluation_case.v1 validation failed: ${errors.join('; ')}`);
  }
  return parsed.data;
}

/**
 * The single definition of "this case may enter the canonical regression
 * baseline". Only APPROVED (human) and SYSTEM_REVIEWED (code-verified) cases
 * gate CI — never DRAFT/REVIEWED, and never fabricated Owner approval.
 */
export function isBaselineEligible(c: Pick<EvaluationCaseV1, 'review_status'>): boolean {
  return c.review_status === 'APPROVED' || c.review_status === 'SYSTEM_REVIEWED';
}

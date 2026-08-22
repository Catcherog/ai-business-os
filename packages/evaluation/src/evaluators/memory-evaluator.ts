/**
 * Memory evaluator (BUSOS-R2-H2-03) — evaluates the REAL H2-01/H2-02 memory
 * stack: `MemoryService` (record / supersede / invalidate / idempotency) and
 * `assembleMemoryContext` (ACTIVE-only, scoped, provenance fail-closed,
 * deterministic sort, bounded, redacted).
 *
 * A golden case drives the evaluator through its `fixture.memory_setup`:
 *   - `records[]`  — deterministic `RecordMemoryInput`-shaped seeds;
 *   - `bulk_count` + `bulk_template` — expand N records (bounds cases);
 *   - `direct_save_records[]` — full `MemoryRecordV1` injected straight into
 *     the repository (defence-in-depth provenance fail-closed tests);
 *   - `actions[]`  — `supersede` / `invalidate` lifecycle operations;
 *   - `context_limits` — optional assembly limits override.
 *
 * Actual (report-safe) = stable refs only: memory ids, count, truncated, types.
 * Content is never emitted into the report (trace-safety rule).
 */

import {
  InMemoryMemoryRepository,
  MemoryService,
  assembleMemoryContext,
  extractMemoriesFromReviewCase,
  type MemoryContextLimits,
  type RecordMemoryInput,
} from '@busos/memory';
import type { MemoryEvidenceKind, MemoryRecordV1 } from '@busos/contracts';
import type { EvaluationCaseV1 } from '../case-schema.js';
import {
  checkIdPresence,
  type CaseOutcome,
  type DimensionScores,
} from '../judges.js';

export const MEMORY_EVALUATOR_VERSION = '0.1.0';

/* ------------------------------------------------------------ fixture */

export interface MemoryRecordInputFixture {
  subject_type: 'CUSTOMER' | 'PROJECT';
  subject_id: string;
  memory_type: 'PREFERENCE' | 'FACT' | 'DECISION' | 'OUTCOME';
  content: string;
  source_type: 'HUMAN_REVIEW' | 'PROJECT' | 'TASK' | 'ASSET' | 'PROCESS_RUN';
  source_ref: string;
  evidence_refs: { kind: MemoryEvidenceKind; ref: string }[];
  confidence: number;
}

export interface MemoryDirectSaveFixture {
  /** Full MemoryRecordV1 saved bypassing the service (assembly fail-closed test). */
  record: Record<string, unknown>;
}

export type MemoryActionFixture =
  | { op: 'supersede'; memory_id: string; input: MemoryRecordInputFixture }
  | { op: 'invalidate'; memory_id: string; reason: string }
  | {
      op: 'derive_review_decision';
      review_case: {
        case_id: string;
        approval: { action: 'APPROVE' | 'EDIT_APPROVE' | 'REJECT' } | null;
        original_candidate?: { candidate_id?: string | null };
      };
      customer_id: string;
    };

export interface MemorySetupFixture {
  project_id: string;
  customer_id?: string | null;
  records?: MemoryRecordInputFixture[];
  /** Generate `bulk_count` records from `bulk_template` (content must contain `{i}`). */
  bulk_count?: number;
  bulk_template?: MemoryRecordInputFixture;
  direct_save_records?: MemoryDirectSaveFixture[];
  actions?: MemoryActionFixture[];
  context_limits?: Partial<MemoryContextLimits>;
  /** Record the `records[]` array twice to prove structural idempotency. */
  repeat_seeds?: boolean;
}

export function isMemorySetupFixture(v: unknown): v is MemorySetupFixture {
  if (!v || typeof v !== 'object') return false;
  const f = v as Record<string, unknown>;
  return typeof f.project_id === 'string';
}

/** Normalise a fixture record into the service's RecordMemoryInput shape. */
function toRecordInput(r: MemoryRecordInputFixture): RecordMemoryInput {
  return {
    subject_type: r.subject_type,
    subject_id: r.subject_id,
    memory_type: r.memory_type,
    content: r.content,
    source_type: r.source_type,
    source_ref: r.source_ref,
    evidence_refs: r.evidence_refs,
    confidence: r.confidence,
  };
}

/**
 * Deterministic template expansion for bulk cases. The `{i}` token is replaced
 * with the 0-based bulk index across EVERY string field of the template,
 * including nested ones (e.g. `evidence_refs[].ref`). Narrow + deterministic:
 * only the literal `{i}` token is substituted; provenance validation
 * (`isCanonicalRef`) and evidence-ref checks are NOT relaxed, so any other
 * non-canonical reference still fails closed exactly as it would for a hand
 * authored record.
 */
function expandBulkTemplate(
  template: MemoryRecordInputFixture,
  index: number,
): MemoryRecordInputFixture {
  const token = String(index);
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return value.replace(/\{i\}/g, token);
    if (Array.isArray(value)) return value.map(walk);
    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k] = walk(v);
      return out;
    }
    return value;
  };
  return walk(template) as MemoryRecordInputFixture;
}

/* -------------------------------------------------- F-03 knowledge guard */

/**
 * Knowledge-vs-Memory boundary guard (KB-SNAPSHOT finding F-03): Memory must
 * hold statements about THIS customer / THIS project — never store-wide
 * Knowledge (pricing tables, deposit policy, add-on rules). These patterns
 * match the studio's verified Knowledge (RULE-001..007) inside a memory
 * content string, so a memory that duplicates Knowledge is reported as a
 * contamination FAIL — a deterministic regression guard, NOT a schema change.
 */
const KNOWLEDGE_IN_MEMORY_PATTERNS: RegExp[] = [
  /\b1499\s*元/, /\b2499\s*元/, /\b3599\s*元/,
  /\b2399\s*元/, /\b5299\s*元/,
  /定金/, /精修加购/, /满四赠一/,
];

export function detectKnowledgeContamination(content: string): string | null {
  const hit = KNOWLEDGE_IN_MEMORY_PATTERNS.find((re) => re.test(content));
  return hit ? hit.source : null;
}

/* ------------------------------------------------------------ evaluator */

const FIXED_NOW = '2026-08-21T06:00:00.000Z';

export async function evaluateMemoryCase(
  case_: EvaluationCaseV1,
): Promise<CaseOutcome> {
  const started = Date.now();
  const rawFixture = case_.fixture;
  // Golden-set authoring wraps the setup under `fixture.memory_setup`; accept
  // either that form or a bare setup object.
  const fixture = (
    rawFixture && typeof rawFixture === 'object' && 'memory_setup' in rawFixture
      ? (rawFixture as { memory_setup?: unknown }).memory_setup
      : rawFixture
  ) as MemorySetupFixture | undefined;
  if (!isMemorySetupFixture(fixture)) {
    return {
      status: 'ERROR',
      failure_reason: 'memory case requires fixture.memory_setup with project_id',
      latency_ms: Date.now() - started,
    };
  }

  const repo = new InMemoryMemoryRepository();
  const svc = new MemoryService(repo, { now: () => FIXED_NOW });
  const expected = case_.expected ?? {};

  try {
    // (1) Seed deterministic records (twice when idempotency is under test).
    const seeded: string[] = [];
    const seedRound = async () => {
      for (const r of fixture.records ?? []) {
        const rec = await svc.recordMemory(toRecordInput(r));
        seeded.push(rec.memory_id);
      }
    };
    await seedRound();
    if (fixture.repeat_seeds) await seedRound();

    // (1b) Bulk expansion for bounds cases.
    if (fixture.bulk_count && fixture.bulk_template) {
      for (let i = 0; i < fixture.bulk_count; i += 1) {
        const t = expandBulkTemplate(fixture.bulk_template, i);
        const rec = await svc.recordMemory(toRecordInput(t));
        seeded.push(rec.memory_id);
      }
    }

    // (1c) Direct saves bypassing the service (assembly defence-in-depth).
    for (const ds of fixture.direct_save_records ?? []) {
      await repo.save(ds.record as unknown as MemoryRecordV1);
    }

    // (2) Lifecycle / derivation actions.
    for (const a of fixture.actions ?? []) {
      if (a.op === 'supersede') {
        await svc.supersedeMemory(a.memory_id, toRecordInput(a.input));
      } else if (a.op === 'invalidate') {
        await svc.invalidateMemory(a.memory_id, a.reason);
      } else if (a.op === 'derive_review_decision') {
        const inputs = extractMemoriesFromReviewCase(a.review_case, a.customer_id);
        for (const input of inputs) {
          const rec = await svc.recordMemory(input);
          seeded.push(rec.memory_id);
        }
      }
    }

    // (1d) F-03 guard: memory content must not duplicate store-wide Knowledge.
    const contamination = [...(fixture.records ?? []), ...(fixture.bulk_template ? [fixture.bulk_template] : [])]
      .map((r) => detectKnowledgeContamination(r.content))
      .find(Boolean);
    if (contamination) {
      return {
        status: 'FAIL',
        failure_reason: `knowledge-in-memory contamination (F-03): content matches "${contamination}"`,
        dimension_scores: { knowledge_boundary: 0 },
        actual: { memory_ids: [], count: 0, truncated: false },
        latency_ms: Date.now() - started,
      };
    }

    // (3) Assemble the governed context (the surface under test).
    const context = await assembleMemoryContext(
      svc,
      { projectId: fixture.project_id, customerId: fixture.customer_id ?? null },
      { limits: fixture.context_limits, now: () => FIXED_NOW },
    );
    const actualIds = context.records.map((r) => r.memory_id);
    const actualContents = context.records.map((r) => r.content);

    // (4) Deterministic assertions.
    const scores: DimensionScores = {};
    const failures: string[] = [];
    let ok = true;

    if (expected.memory_ids) {
      const { ok: okIds, missing } = checkIdPresence(
        actualIds,
        expected.memory_ids,
        expected.forbidden_memory_ids ?? [],
      );
      ok = ok && okIds;
      if (missing.length > 0) failures.push(`missing memory: ${missing.join(',')}`);
    }
    if (expected.forbidden_memory_ids) {
      const { violations } = checkIdPresence(actualIds, [], expected.forbidden_memory_ids);
      ok = ok && violations.length === 0;
      if (violations.length > 0) {
        failures.push(`forbidden memory used: ${violations.join(',')}`);
      }
    }
    if (expected.memory_required === true && context.count === 0) {
      ok = false;
      failures.push('memory_required=true but context is empty');
    }
    if (expected.expect_count !== undefined && context.count !== expected.expect_count) {
      ok = false;
      failures.push(`count=${context.count}, expected ${expected.expect_count}`);
    }
    if (expected.expect_truncated !== undefined && context.truncated !== expected.expect_truncated) {
      ok = false;
      failures.push(`truncated=${context.truncated}, expected ${expected.expect_truncated}`);
    }
    if (expected.forbidden_content && expected.forbidden_content.length > 0) {
      for (const needle of expected.forbidden_content) {
        if (actualContents.some((c) => c.includes(needle))) {
          ok = false;
          failures.push(`forbidden content leaked into context: ${needle}`);
        }
      }
    }

    scores.memory_precision = actualIds.length === 0 ? 1 : expected.memory_ids
      ? expected.memory_ids.filter((id) => actualIds.includes(id)).length / actualIds.length
      : 1;

    // Governance-bypass guard: when the case expects fail-closed but the system
    // silently proceeded, the case must FAIL — never a silent pass.
    if (expected.fail_closed === true) {
      return {
        status: 'FAIL',
        failure_reason:
          'expected fail-closed but the system proceeded silently (governance bypass)',
        dimension_scores: { fail_closed: 0 },
        actual: { memory_ids: actualIds, count: context.count, truncated: context.truncated },
        latency_ms: Date.now() - started,
      };
    }

    return {
      status: ok ? 'PASS' : 'FAIL',
      failure_reason: ok ? undefined : failures.join('; '),
      dimension_scores: scores,
      actual: {
        memory_ids: actualIds,
        count: context.count,
        truncated: context.truncated,
        types: [...new Set(context.records.map((r) => r.memory_type))],
      },
      latency_ms: Date.now() - started,
    };
  } catch (e) {
    // fail_closed cases PASS only when the system correctly refused to proceed.
    if (expected.fail_closed === true) {
      return {
        status: 'PASS',
        failure_reason: undefined,
        dimension_scores: { fail_closed: 1 },
        actual: { error: (e as Error).constructor.name },
        latency_ms: Date.now() - started,
      };
    }
    return {
      status: 'ERROR',
      failure_reason: `unexpected error: ${(e as Error).message}`,
      actual: { error: (e as Error).constructor.name },
      latency_ms: Date.now() - started,
    };
  }
}


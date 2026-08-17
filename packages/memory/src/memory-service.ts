import {
  type MemoryRecordV1,
  type MemorySubjectType,
  type MemoryType,
  type MemorySourceType,
  type MemoryEvidenceRef,
  assertMemoryRecordV1,
  isActiveMemory,
  scopeForSubjectType,
  ContractValidationError,
} from '@busos/contracts';

import { MemoryRepository, InMemoryMemoryRepository } from './memory-repository.js';
import { deriveMemoryId, isCanonicalRef } from './id.js';

/** The caller-supplied fields needed to record a memory. */
export interface RecordMemoryInput {
  subject_type: MemorySubjectType;
  subject_id: string;
  memory_type: MemoryType;
  content: string;
  source_type: MemorySourceType;
  source_ref: string;
  evidence_refs: MemoryEvidenceRef[];
  confidence: number;
}

/** The caller-supplied fields needed to supersede an existing memory. */
export interface SupersedeMemoryInput {
  content: string;
  memory_type: MemoryType;
  source_type: MemorySourceType;
  source_ref: string;
  evidence_refs: MemoryEvidenceRef[];
  confidence: number;
}

/**
 * Fail closed (gate D): a memory is only ever as trustworthy as its provenance.
 * Missing or non-canonical provenance is rejected — we never fabricate a
 * reference, a payload, a prompt, or a credential as "evidence".
 */
function requireProvenance(input: {
  source_ref: string;
  evidence_refs: MemoryEvidenceRef[];
}): void {
  if (!input.source_ref || !isCanonicalRef(input.source_ref)) {
    throw new ContractValidationError('memory.provenance', [
      `source_ref is not a canonical reference: ${JSON.stringify(input.source_ref)}`,
    ]);
  }
  if (!input.evidence_refs || input.evidence_refs.length === 0) {
    throw new ContractValidationError('memory.provenance', [
      'at least one evidence_ref is required — provenance is mandatory',
    ]);
  }
  for (const ev of input.evidence_refs) {
    if (!isCanonicalRef(ev.ref)) {
      throw new ContractValidationError('memory.provenance', [
        `evidence ref is not a canonical reference: ${JSON.stringify(ev.ref)}`,
      ]);
    }
  }
}

/**
 * `MemoryService` — the governed boundary for the canonical Memory foundation
 * (H2-01). Narrow by design:
 *
 *   - CREATE  via `recordMemory` (deterministic id → idempotent)
 *   - READ    via `getMemory` / `listMemoriesForSubject` / `listForContext`
 *   - CHANGE  via `supersedeMemory` / `invalidateMemory` (no destructive delete)
 *
 * Business logic lives HERE, never in the UI. No embeddings, no vector search,
 * no semantic retrieval, no autonomous LLM extraction.
 */
export class MemoryService {
  private readonly repo: MemoryRepository;
  private readonly now: () => string;

  constructor(
    repo: MemoryRepository = new InMemoryMemoryRepository(),
    opts: { now?: () => string } = {},
  ) {
    this.repo = repo;
    this.now = opts.now ?? (() => new Date().toISOString());
  }

  /** Record a new ACTIVE memory. Idempotent on identical input (gate E). */
  async recordMemory(input: RecordMemoryInput): Promise<MemoryRecordV1> {
    requireProvenance(input);
    const scope = scopeForSubjectType(input.subject_type);
    const memoryId = deriveMemoryId({
      subject_type: input.subject_type,
      subject_id: input.subject_id,
      memory_type: input.memory_type,
      source_type: input.source_type,
      source_ref: input.source_ref,
      content: input.content,
    });

    // Idempotency (gate E): reprocessing the identical source yields the
    // identical id, so the existing record (whatever its lifecycle status) is
    // returned. A duplicate is never created.
    const existing = await this.repo.get(memoryId);
    if (existing) return existing;

    const now = this.now();
    const candidate: MemoryRecordV1 = {
      version: 'memory_record.v1',
      memory_id: memoryId,
      scope,
      subject_type: input.subject_type,
      subject_id: input.subject_id,
      memory_type: input.memory_type,
      content: input.content,
      source_type: input.source_type,
      source_ref: input.source_ref,
      evidence_refs: input.evidence_refs,
      confidence: input.confidence,
      status: 'ACTIVE',
      supersedes_memory_id: null,
      superseded_by_memory_id: null,
      invalidation_reason: null,
      created_at: now,
      updated_at: now,
    };

    // Fail closed: a structurally inconsistent record can never be persisted.
    const validated = assertMemoryRecordV1(candidate);
    await this.repo.save(validated);
    return validated;
  }

  /** Fetch a single memory by id (or null). The audit trail survives supersede. */
  async getMemory(memoryId: string): Promise<MemoryRecordV1 | null> {
    return this.repo.get(memoryId);
  }

  /**
   * Subject-scoped reads (gate G). By default only ACTIVE memories are returned;
   * pass `{ activeOnly: false }` to see the full lifecycle (audit).
   */
  async listMemoriesForSubject(
    subjectType: MemorySubjectType,
    subjectId: string,
    opts: { activeOnly?: boolean } = {},
  ): Promise<MemoryRecordV1[]> {
    const all = await this.repo.listBySubject(subjectType, subjectId);
    return opts.activeOnly === false ? all : all.filter(isActiveMemory);
  }

  /**
   * Read-only projection for the Operator Workspace Project Detail: the active
   * memories for the project PLUS the customer-wide active memories that apply
   * to it (a CUSTOMER memory is project-agnostic and therefore shown in every
   * one of that customer's projects). Deduped by `memory_id`.
   */
  async listForContext(
    projectId: string,
    customerId?: string | null,
  ): Promise<MemoryRecordV1[]> {
    const projectMem = await this.listMemoriesForSubject('PROJECT', projectId, {
      activeOnly: true,
    });
    const custMem = customerId
      ? await this.listMemoriesForSubject('CUSTOMER', customerId, { activeOnly: true })
      : [];
    const seen = new Set<string>();
    return [...projectMem, ...custMem].filter((m) => {
      if (seen.has(m.memory_id)) return false;
      seen.add(m.memory_id);
      return true;
    });
  }

  /**
   * Supersede an ACTIVE memory with a corrected/newer one. The old record is
   * marked SUPERSEDED (its `superseded_by_memory_id` set) and hidden from
   * active reads; the replacement is ACTIVE and points back via
   * `supersedes_memory_id`. No record is ever destroyed (gate F).
   */
  async supersedeMemory(
    memoryId: string,
    input: SupersedeMemoryInput,
  ): Promise<MemoryRecordV1> {
    const old = await this.repo.get(memoryId);
    if (!old) throw new Error(`MEMORY_NOT_FOUND: ${memoryId}`);
    if (!isActiveMemory(old)) {
      throw new ContractValidationError('memory.supersede', [
        `cannot supersede a non-active memory (status=${old.status})`,
      ]);
    }
    requireProvenance(input);

    const now = this.now();
    const newId = deriveMemoryId({
      subject_type: old.subject_type,
      subject_id: old.subject_id,
      memory_type: input.memory_type,
      source_type: input.source_type,
      source_ref: input.source_ref,
      content: input.content,
    });

    // If the replacement is byte-identical to the current (idempotent
    // reprocessing), there is nothing to supersede — return the existing record.
    if (newId === memoryId) return old;

    const supersededOld: MemoryRecordV1 = {
      ...old,
      status: 'SUPERSEDED',
      superseded_by_memory_id: newId,
      updated_at: now,
    };
    const replacement: MemoryRecordV1 = {
      version: 'memory_record.v1',
      memory_id: newId,
      scope: old.scope,
      subject_type: old.subject_type,
      subject_id: old.subject_id,
      memory_type: input.memory_type,
      content: input.content,
      source_type: input.source_type,
      source_ref: input.source_ref,
      evidence_refs: input.evidence_refs,
      confidence: input.confidence,
      status: 'ACTIVE',
      supersedes_memory_id: memoryId,
      superseded_by_memory_id: null,
      invalidation_reason: null,
      created_at: now,
      updated_at: now,
    };

    // Fail closed on both ends of the lifecycle transition.
    const vOld = assertMemoryRecordV1(supersededOld);
    const vNew = assertMemoryRecordV1(replacement);
    await this.repo.save(vOld);
    await this.repo.save(vNew);
    return vNew;
  }

  /**
   * Invalidate an ACTIVE memory (it is wrong / no longer applicable). Marked
   * INVALIDATED with a mandatory reason — never destroyed (gate F). The reason
   * is itself part of the audit trail.
   */
  async invalidateMemory(memoryId: string, reason: string): Promise<MemoryRecordV1> {
    if (!reason || reason.trim().length === 0) {
      throw new ContractValidationError('memory.invalidate', [
        'an INVALIDATED memory must state why',
      ]);
    }
    const old = await this.repo.get(memoryId);
    if (!old) throw new Error(`MEMORY_NOT_FOUND: ${memoryId}`);
    if (!isActiveMemory(old)) {
      throw new ContractValidationError('memory.invalidate', [
        `cannot invalidate a non-active memory (status=${old.status})`,
      ]);
    }
    const now = this.now();
    const invalidated: MemoryRecordV1 = {
      ...old,
      status: 'INVALIDATED',
      invalidation_reason: reason,
      updated_at: now,
    };
    const v = assertMemoryRecordV1(invalidated);
    await this.repo.save(v);
    return v;
  }
}

/* ------------------------------------------------------------------ extraction
 * Deterministic, rule-based derivation of memory from existing canonical BUSOS
 * surfaces. NO LLM, NO semantic parsing: the content is a fixed statement built
 * from fields the source already exposes. Each derivation fails CLOSED (returns
 * []) when the provenance it would cite cannot be resolved — it never invents a
 * reference.
 */

/** Minimal structural view of a human-review case (duck-typed, no coupling). */
export interface ReviewCaseLike {
  case_id: string;
  approval: { action: 'APPROVE' | 'EDIT_APPROVE' | 'REJECT' } | null;
  original_candidate?: { candidate_id?: string | null };
}

/** Minimal structural view of a process run (duck-typed, no coupling). */
export interface ProcessRunLike {
  processId: string;
  status: string;
  result?: { output?: { projectId?: string; assetId?: string } } | undefined;
}

/** Derive a DECISION memory from an approved human review, anchored to the customer. */
export function extractMemoriesFromReviewCase(
  reviewCase: ReviewCaseLike,
  customerId: string,
): RecordMemoryInput[] {
  if (!reviewCase.case_id || !customerId) return [];
  const a = reviewCase.approval;
  if (!a) return [];
  const candidateId = reviewCase.original_candidate?.candidate_id ?? '未知';
  return [
    {
      subject_type: 'CUSTOMER',
      subject_id: customerId,
      memory_type: 'DECISION',
      content: `审阅决策：${a.action}（线索 ${candidateId}）`,
      source_type: 'HUMAN_REVIEW',
      source_ref: reviewCase.case_id,
      evidence_refs: [
        { kind: 'REVIEW_CASE', ref: reviewCase.case_id },
        { kind: 'CUSTOMER', ref: customerId },
      ],
      confidence: 1,
    },
  ];
}

/** Derive an OUTCOME memory from a successful process run, anchored to the project. */
export function extractMemoriesFromProcessRun(run: ProcessRunLike): RecordMemoryInput[] {
  if (run.status !== 'SUCCEEDED') return [];
  const out = run.result?.output;
  if (!out?.projectId || !out?.assetId) return [];
  return [
    {
      subject_type: 'PROJECT',
      subject_id: out.projectId,
      memory_type: 'OUTCOME',
      content: `运行 ${run.processId} 成功生成素材 ${out.assetId}`,
      source_type: 'PROCESS_RUN',
      source_ref: run.processId,
      evidence_refs: [
        { kind: 'PROCESS_RUN', ref: run.processId },
        { kind: 'ASSET', ref: out.assetId },
      ],
      confidence: 1,
    },
  ];
}

import type {
  MemoryRecordV1,
  MemorySubjectType,
  MemoryType,
  MemorySourceType,
  MemoryEvidenceRef,
} from '@busos/contracts';
import { assertMemoryRecordV1, ContractValidationError } from '@busos/contracts';

import type { MemoryService } from './memory-service.js';
import { isCanonicalRef } from './id.js';

/**
 * Governed Memory Context Consumption (BUSOS-R2-H2-02).
 *
 * A `MemoryContext` is a *bounded, deterministic, auditable* projection of the
 * canonical ACTIVE memory that applies to one (project, customer) pair. It is the
 * minimal, governed business context a real AI Business Action (today: Generate
 * Visual Reference) may consume — NOT a chat history, NOT a vector store, NOT a
 * generic RAG platform.
 *
 * Invariants (gate spec §5):
 *   1. Only ACTIVE memory is read (via `MemoryService.listForContext`).
 *   2. Scope is bounded to `project_id` + its `customer_id` (no cross-project /
 *      cross-customer leakage).
 *   3. Audit fields (memory_id / type / subject / source / evidence) are preserved.
 *   4. Assembly is DETERMINISTIC: same project + customer + ACTIVE memories =>
 *      identical ordering and representation.
 *   5. Bounded: explicit record / content / total-content limits.
 *   6. No credential / token / password / raw third-party payload ever enters the
 *      context; obvious credential material in content is redacted.
 *   7. Provenance that is not canonical FAILS CLOSED (throws) — never silently
 *      dropped or included.
 */

/** A single memory record inside an assembled context (audit fields preserved). */
export interface MemoryContextRecord {
  memory_id: string;
  memory_type: MemoryType;
  subject_type: MemorySubjectType;
  subject_id: string;
  source_type: MemorySourceType;
  source_ref: string;
  evidence_refs: MemoryEvidenceRef[];
  /** Bounded + (optionally) secret-redacted content. */
  content: string;
  created_at: string;
  updated_at: string;
}

/** Hard limits applied during context assembly. */
export interface MemoryContextLimits {
  /** Maximum number of records carried into the context. */
  maxRecords: number;
  /** Maximum length of a single record's content. */
  maxContentLength: number;
  /** Maximum total content length across all carried records. */
  maxTotalContentLength: number;
}

export const DEFAULT_MEMORY_CONTEXT_LIMITS: MemoryContextLimits = {
  maxRecords: 20,
  maxContentLength: 500, // == the contract content cap; defensive clamp.
  maxTotalContentLength: 4000,
};

export interface MemoryContextOptions {
  limits?: Partial<MemoryContextLimits>;
  /** Fail closed when an assembled record has non-canonical provenance (default true). */
  failClosedOnBadProvenance?: boolean;
  /** Redact obvious credential material from content (default true). */
  redactSecrets?: boolean;
  now?: () => string;
}

/** The bounded, deterministic, auditable context handed to a consumer. */
export interface MemoryContext {
  project_id: string;
  customer_id: string | null;
  records: MemoryContextRecord[];
  count: number;
  truncated: boolean;
  limits: MemoryContextLimits;
  generated_at: string;
}

/**
 * The minimal, safe-to-emit summary of a context — used in the action trace and
 * the creative-production result. It carries NO content / prompt / secret, only
 * stable references, so it is always safe to surface in logs / UI / trace.
 */
export interface MemoryContextSummary {
  count: number;
  types: string[];
  refs: string[];
  truncated: boolean;
}

/**
 * Defense-in-depth: obvious credential material (`password=...`, `api_key:...`,
 * `Bearer ...`) is never carried into a context. The keyword must be immediately
 * followed by `[:=]<value>` to avoid redacting ordinary business language.
 */
const SECRET_KEYWORD_RE =
  /(sk|pk|rk|bearer|api[_-]?key|apikey|password|passwd|secret|token|authorization|credential)/i;
const SECRET_VALUE_RE = new RegExp(`(${SECRET_KEYWORD_RE.source})\\s*[:=]\\s*\\S+`, 'gi');

export function redactSecretContent(content: string): string {
  return content.replace(SECRET_VALUE_RE, '$1=[REDACTED]');
}

/**
 * Provenance fail-closed (gate E). The write path already validates provenance,
 * but the assembler re-checks it: a record that somehow slipped past (corrupted
 * repository, future writer) must never be silently included OR silently dropped
 * from a governed context — it must error so the consumer can fail closed.
 */
function validateProvenance(record: MemoryRecordV1): void {
  if (!record.source_ref || !isCanonicalRef(record.source_ref)) {
    throw new ContractValidationError('memory.context.provenance', [
      `source_ref is not a canonical reference: ${JSON.stringify(record.source_ref)}`,
    ]);
  }
  if (!record.evidence_refs || record.evidence_refs.length === 0) {
    throw new ContractValidationError('memory.context.provenance', [
      'at least one evidence_ref is required — provenance is mandatory',
    ]);
  }
  for (const ev of record.evidence_refs) {
    if (!ev.ref || !isCanonicalRef(ev.ref)) {
      throw new ContractValidationError('memory.context.provenance', [
        `evidence ref is not a canonical reference: ${JSON.stringify(ev.ref)}`,
      ]);
    }
  }
  // Scope/lifecycle contract invariants (scope↔subject, ACTIVE ⇒ not superseded/…).
  assertMemoryRecordV1(record);
}

export interface ContextScope {
  projectId: string;
  customerId?: string | null;
}

/**
 * Assemble the governed memory context for a (project, customer) pair.
 *
 * Deterministic + bounded + fail-closed. Returns `count: 0` (empty records) only
 * when there is genuinely no ACTIVE memory in scope — never throws for that case.
 */
export async function assembleMemoryContext(
  service: MemoryService,
  scope: ContextScope,
  options: MemoryContextOptions = {},
): Promise<MemoryContext> {
  const limits: MemoryContextLimits = {
    ...DEFAULT_MEMORY_CONTEXT_LIMITS,
    ...(options.limits ?? {}),
  };
  const failClosed = options.failClosedOnBadProvenance ?? true;
  const redact = options.redactSecrets ?? true;
  const now = options.now ?? (() => new Date().toISOString());

  // (1) ACTIVE-only, scoped to project + associated customer. listForContext
  // already enforces scope isolation + active-only, so no cross-project /
  // cross-customer memory can enter the context.
  const raw = await service.listForContext(scope.projectId, scope.customerId);

  // (2) Provenance fail-closed: reject any record that fails contract validation.
  for (const r of raw) {
    if (failClosed) validateProvenance(r);
  }

  // (3) Deterministic ordering — a fully-specified, stable sort key.
  const sorted = [...raw].sort((a, b) => {
    if (a.subject_type !== b.subject_type) return a.subject_type < b.subject_type ? -1 : 1;
    if (a.memory_type !== b.memory_type) return a.memory_type < b.memory_type ? -1 : 1;
    if (a.updated_at !== b.updated_at) return a.updated_at < b.updated_at ? -1 : 1;
    return a.memory_id < b.memory_id ? -1 : a.memory_id > b.memory_id ? 1 : 0;
  });

  // (4) Bounded: clamp records + per-record content, enforce total content cap.
  let truncated = false;
  let totalContent = 0;
  const records: MemoryContextRecord[] = [];
  for (const r of sorted) {
    if (records.length >= limits.maxRecords) {
      truncated = true;
      break;
    }
    let content = r.content;
    if (content.length > limits.maxContentLength) {
      content = content.slice(0, limits.maxContentLength) + '…';
      truncated = true;
    }
    if (redact) content = redactSecretContent(content);
    if (totalContent + content.length > limits.maxTotalContentLength) {
      truncated = true;
      break;
    }
    totalContent += content.length;
    records.push({
      memory_id: r.memory_id,
      memory_type: r.memory_type,
      subject_type: r.subject_type,
      subject_id: r.subject_id,
      source_type: r.source_type,
      source_ref: r.source_ref,
      evidence_refs: r.evidence_refs,
      content,
      created_at: r.created_at,
      updated_at: r.updated_at,
    });
  }

  return {
    project_id: scope.projectId,
    customer_id: scope.customerId ?? null,
    records,
    count: records.length,
    truncated,
    limits,
    generated_at: now(),
  };
}

/** Project a context down to the minimal, trace/UI-safe summary. */
export function toMemoryContextSummary(ctx: MemoryContext): MemoryContextSummary {
  const types = [...new Set(ctx.records.map((r) => r.memory_type))];
  const refs = ctx.records.map((r) => r.memory_id);
  return { count: ctx.count, types, refs, truncated: ctx.truncated };
}

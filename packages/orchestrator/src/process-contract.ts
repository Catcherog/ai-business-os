/**
 * BUSOS-P6-02 — Business Process Contract.
 *
 * The orchestrator-level state machine, structured trace, and error taxonomy.
 * This is the stable surface a caller (API, job runner, future dashboard) may
 * depend on. It deliberately exposes ONLY stable references (ids, statuses,
 * classified errors) — never internal slice object trees, never raw third-party
 * payloads, never secrets.
 */

import type { MemoryContextSummary } from '@busos/memory';

/**
 * Terminal + in-flight process states.
 *
 * Core semantic (P6-02): a *business* outcome is not a *system* failure.
 *   - `REJECTED`       — the business declined to proceed (governance REJECT,
 *                        ineligible lead/project, empty prompt, ...). Working
 *                        as designed; fail-closed; no system fault.
 *   - `HUMAN_REQUIRED` — the business needs a human decision before proceeding
 *                        (governance REVIEW_REQUIRED). Not a fault either.
 *   - `FAILED`         — a system/integration fault (adapter exception, write
 *                        that cannot be verified, invalid orchestrator input).
 *   - `RUNNING`        — recorded for an in-flight execution; also returned as a
 *                        deterministic duplicate response when an execution with
 *                        the same idempotency key is already in flight.
 */
export type BusinessProcessStatus =
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'REJECTED'
  | 'HUMAN_REQUIRED';

/**
 * Pipeline stages.
 *
 * These are the REAL composed slices in this repository, so the existing
 * business model is preserved rather than renamed to match a generic template:
 *
 *   GOLDEN_PATH        — candidate build + GOVERNANCE decision +
 *                        CUSTOMER_RESOLUTION + BUSINESS_PERSISTENCE of
 *                        Lead/Customer (all three live inside `@busos/golden-path`)
 *   PROJECT_LIFECYCLE  — Lead -> Project + initial Task
 *   CREATIVE_PRODUCTION— Project -> Creative Task -> Lumen -> Asset -> Task DONE
 *   SERVICE_AGENT      — BUSOS-R2-SCS-INTEGRATION-01: a real customer-service
 *                        Run through the frozen Service Agent (synchronous
 *                        inference + structured result). This is a NARROW
 *                        vertical slice (`runServiceAgentConsultation`), NOT a
 *                        stage of the consultation pipeline — it is deliberately
 *                        excluded from `PROCESS_STAGE_ORDER` so the pipeline
 *                        stage rendering stays untouched.
 */
export type BusinessProcessStage =
  | 'GOLDEN_PATH'
  | 'PROJECT_LIFECYCLE'
  | 'CREATIVE_PRODUCTION'
  | 'SERVICE_AGENT';

export const PROCESS_STAGE_ORDER: readonly BusinessProcessStage[] = [
  'GOLDEN_PATH',
  'PROJECT_LIFECYCLE',
  'CREATIVE_PRODUCTION',
] as const;

/**
 * How the caller may act on a system failure.
 *
 * `HUMAN_REQUIRED` is intentionally NOT a disposition — it is already expressed
 * by `BusinessProcessStatus`, and duplicating it here would create two competing
 * sources of truth.
 */
export type ProcessErrorDisposition =
  | 'RETRYABLE'
  | 'TERMINAL'
  | 'EXTERNAL_DEPENDENCY';

/** Stable, machine-readable failure codes emitted by the orchestrator. */
export type ProcessErrorCode =
  /** Structurally invalid orchestrator input (never reached a slice). */
  | 'INVALID_INPUT'
  /** Contract/schema/field-conversion rejection — retrying cannot help. */
  | 'CONTRACT_VALIDATION_FAILED'
  /** Transient upstream fault: 5xx, timeout, socket/network error. */
  | 'UPSTREAM_TEMPORARY_FAILURE'
  /** Third-party capacity/quota/rate limit exhausted (e.g. CloudBase quota). */
  | 'EXTERNAL_QUOTA_EXHAUSTED'
  /** A write succeeded but could not be verified by readback (D019). */
  | 'PERSISTENCE_NOT_VERIFIED'
  /** Creative generation failed upstream (Lumen). */
  | 'CREATIVE_GENERATION_FAILED'
  /** Idempotency bookkeeping itself failed. */
  | 'REGISTRY_FAILURE'
  /** Unclassifiable fault — fail closed as TERMINAL (no automatic re-run). */
  | 'UNCLASSIFIED_FAILURE';

/** A classified system failure. Business rejections never appear here. */
export interface ProcessError {
  code: ProcessErrorCode;
  /** Sanitized, human-readable summary. Never carries secrets. */
  message: string;
  stage: BusinessProcessStage;
  disposition: ProcessErrorDisposition;
}

/**
 * A business (non-fault) decision to stop. Kept separate from `ProcessError` so
 * that "rejected" can never be mistaken for "broken".
 */
export interface ProcessRejection {
  stage: BusinessProcessStage;
  /** Documented slice reason code, e.g. `LEAD_NOT_FOUND`, `REJECT`. */
  reasonCode: string;
  message: string;
}

export type ProcessTraceStatus =
  | 'STARTED'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'REJECTED'
  | 'HUMAN_REQUIRED';

/**
 * One structured trace record. Every executed stage emits a `STARTED` event and
 * exactly one terminal event — a stage can never be left dangling at `STARTED`
 * (enforced by `runBusinessProcess`, gate P6-G).
 */
export interface ProcessTraceEvent {
  processId: string;
  stage: BusinessProcessStage;
  status: ProcessTraceStatus;
  /** ISO-8601 UTC. */
  startedAt: string;
  /** ISO-8601 UTC; present on terminal events. */
  endedAt?: string;
  durationMs?: number;
  error?: ProcessError;
  /**
   * Controlled key/value context. Only stable references survive sanitization
   * (see `sanitizeTraceMetadata`): ids, decisions, reason codes, counters.
   * Secrets, credentials, prompts and raw third-party payloads are dropped.
   */
  metadata?: Record<string, unknown>;
}

/** Stable references the orchestrator is allowed to surface. */
export interface BusinessProcessOutput {
  leadId?: string;
  customerId?: string;
  projectId?: string;
  taskId?: string;
  assetId?: string;
  assetUri?: string;
  /**
   * H2-02 — the minimal, trace/UI-safe summary of the governed memory context
   * that was consumed by this action. Carries NO content / prompt / secret — only
   * stable references (count, types, memory_ids, truncation flag). `undefined`
   * when no governed memory was in scope (memory service or customer not wired).
   */
  governedMemory?: MemoryContextSummary;
  /**
   * BUSOS-R2-SCS-INTEGRATION-01 — the Service Agent run result summary surfaced
   * on a `SERVICE_AGENT` run. Carries the structured answer / intent / risk /
   * handoff / evidence refs + run metadata. The full structured payload is
   * defined by `@busos/service-agent-port`; this is a UI/trace-safe projection.
   */
  serviceAgent?: ServiceAgentOutputSummary;
}

/**
 * BUSOS-R2-SCS-INTEGRATION-01 — minimal, UI-safe summary of one Service Agent
 * run. No prompt / secret / raw payload: only stable refs, structured status
 * and a bounded answer preview.
 */
export interface ServiceAgentOutputSummary {
  /** The agent's final reply. Bounded length (sanitized before display). */
  answer: string;
  /** Agent intent id (I00..I12). */
  intent: string;
  /** Agent risk level (R0..R3). */
  risk: string;
  /** Agent route (KB_PATH / HUMAN_PATH). */
  route: string;
  /** Human-review / handoff status (structured, never string-guessed). */
  handoff: {
    mustHandoff: boolean;
    needsClarification: boolean;
    answerRequiresDisclaimer: boolean;
    needsHumanConfirm: boolean;
  };
  /** Retrieval evidence refs (AC-06). */
  evidence: {
    sourceModules: string[];
    retrievalScore: number;
    canonicalAnswerId: string | null;
    sourceBlockId: string | null;
    hasRetrievalEvidence: boolean;
  };
  /** Run / trace metadata (AC-08 / AC-13 provenance). */
  trace: {
    runId: string;
    requestId: string;
    conversationId: string;
    latencyMs: number;
    llmUsed: boolean;
  };
}

/**
 * The canonical result of `runBusinessProcess`. Deliberately flat: no internal
 * slice result object is dumped here.
 */
export interface BusinessProcessResult {
  processId: string;
  idempotencyKey?: string;

  status: BusinessProcessStatus;

  /** Stage the process stopped at (undefined on full success). */
  currentStage?: BusinessProcessStage;
  /** Stages that reached a successful business outcome, in execution order. */
  completedStages: BusinessProcessStage[];

  /** ISO-8601 UTC. */
  startedAt: string;
  endedAt: string;
  durationMs: number;

  output?: BusinessProcessOutput;

  /** Present only when `status === 'FAILED'`. */
  error?: ProcessError;
  /** Present only when `status` is `REJECTED` or `HUMAN_REQUIRED`. */
  rejection?: ProcessRejection;

  trace: ProcessTraceEvent[];

  /**
   * True when this result was replayed from the process registry because an
   * execution with the same `idempotencyKey` already existed — meaning NO
   * downstream side effect was performed by this call (gates P6-H / P6-I).
   */
  deduplicated?: boolean;
}

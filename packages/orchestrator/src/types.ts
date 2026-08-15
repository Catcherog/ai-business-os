import type { GoldenPathInput, CandidateBuilder, GovernanceFn } from '@busos/golden-path';
import type { BusinessRepository } from '@busos/business-repository';
import type { LumenPort } from '@busos/lumen-adapter';
import type { ProcessRegistry } from './process-registry.js';

/**
 * Dependency-injected collaborators. A single shared `BusinessRepository`
 * satisfies the GoldenPath / ProjectLifecycle / CreativeProduction repository
 * ports (duck-typed), and a single `LumenPort` drives creative generation.
 */
export interface OrchestratorDeps {
  businessRepository: BusinessRepository;
  lumen: LumenPort;
  /** Override candidate builder (defaults to `buildCandidateFromInput`). */
  candidateBuilder?: CandidateBuilder;
  /** Override governance (defaults to `govern`). */
  governance?: GovernanceFn;
  /**
   * Idempotency store (P6-02). May also be supplied per call via
   * `ProcessRunOptions.registry`, which takes precedence.
   */
  processRegistry?: ProcessRegistry;
}

/** End-to-end business-process input. */
export interface OrchestratorInput {
  goldenPath: GoldenPathInput;
  projectType: string;
  projectTitle: string;
  /** Explicit YYYY-MM-DD or omitted (BL-006: never coerced). */
  scheduledDate?: string;
  creativeTitle?: string;
  prompt: string;
  sourceImageBase64: string;
  sourceImageMimeType: string;
}

/**
 * Per-call execution options (P6-02). Kept as a separate optional third
 * argument so the P6-01 two-argument call signature stays valid.
 */
export interface ProcessRunOptions {
  /** Caller-supplied id; generated when omitted. */
  processId?: string;
  /**
   * Business-level de-duplication key. Requires a `ProcessRegistry` (here or in
   * `deps`); supplying a key without one fails closed rather than silently
   * dropping the guarantee.
   */
  idempotencyKey?: string;
  registry?: ProcessRegistry;
  /**
   * EXTENSION POINT — explicit, owner-requested re-execution of a previously
   * recorded **non-TERMINAL** failure (RETRYABLE / EXTERNAL_DEPENDENCY). Default
   * `false`: duplicates replay the recorded failure.
   *
   * P6-02 scope: this re-runs the process from the START. There is deliberately
   * no partial-stage resume engine, no distributed lock and no durable registry
   * yet. A TERMINAL failure is never re-executed, even with this flag.
   */
  retryPreviousFailure?: boolean;
}

// ---------------------------------------------------------------------------
// P6-01 compatibility aliases.
//
// The P6-01 vocabulary (`ProcessStage`, `ProcessResult`, ...) was superseded by
// the richer P6-02 contract in `process-contract.ts`. These aliases keep older
// imports compiling and point readers at the canonical names.
// ---------------------------------------------------------------------------
export type {
  BusinessProcessStage as ProcessStage,
  BusinessProcessStatus as ProcessStatus,
  BusinessProcessResult as ProcessResult,
  ProcessTraceEvent,
  ProcessError,
  ProcessErrorDisposition,
} from './process-contract.js';

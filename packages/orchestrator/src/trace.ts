/**
 * BUSOS-P6-02 — Structured process trace.
 *
 * Upgraded from the P6-01 free-form logger into an auditable event stream:
 * every executed stage emits a `STARTED` event and exactly one terminal event
 * (`SUCCEEDED` / `FAILED` / `REJECTED` / `HUMAN_REQUIRED`) carrying timing and,
 * on failure, the classified `ProcessError`.
 *
 * Metadata is CONTROLLED, not free-form: only an allowlist of stable business
 * references and decision codes survives. Secrets, credentials, prompts, and raw
 * third-party responses are dropped rather than redacted, so they can never be
 * reconstructed from the trace.
 */
import type {
  BusinessProcessStage,
  ProcessError,
  ProcessTraceEvent,
  ProcessTraceStatus,
} from './process-contract.js';

/**
 * The ONLY metadata keys allowed in a trace event. Everything else is dropped.
 * Extend deliberately — each addition is an audit-surface decision.
 */
export const ALLOWED_TRACE_METADATA_KEYS: ReadonlySet<string> = new Set([
  // stable business references
  'leadId',
  'customerId',
  'projectId',
  'taskId',
  'assetId',
  'jobId',
  'lumenProjectId',
  'recordId',
  // decisions / outcomes
  'governanceDecision',
  'reasonCode',
  'sliceStatus',
  'idempotency',
  // small counters
  'leadWrites',
  'customerWrites',
  'linkWrites',
  'projectWrites',
  'taskWrites',
  'assetWrites',
  'attempt',
]);

const MAX_METADATA_VALUE_LENGTH = 200;

/**
 * Allowlist-filter metadata down to primitive, non-sensitive values.
 *
 * Rules:
 *  - key must be in `ALLOWED_TRACE_METADATA_KEYS`;
 *  - value must be a string / finite number / boolean (objects, arrays and
 *    functions are dropped — they are how object trees and API payloads leak);
 *  - strings are clamped to a short length;
 *  - `undefined` / `null` are dropped (never emit empty noise).
 */
export function sanitizeTraceMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!ALLOWED_TRACE_METADATA_KEYS.has(key)) continue;
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      out[key] =
        value.length > MAX_METADATA_VALUE_LENGTH
          ? `${value.slice(0, MAX_METADATA_VALUE_LENGTH)}…`
          : value;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = value;
    } else if (typeof value === 'boolean') {
      out[key] = value;
    }
    // everything else (objects, arrays, functions, symbols, bigint) is dropped
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Handle returned by `TraceCollector.start`, used to close the stage exactly once. */
export interface OpenStage {
  readonly stage: BusinessProcessStage;
  readonly startedAtMs: number;
  /** True once a terminal event has been emitted for this stage. */
  readonly settled: boolean;
}

interface OpenStageInternal extends OpenStage {
  settled: boolean;
}

/**
 * Collects `ProcessTraceEvent`s for a single process execution.
 *
 * `finalizeDangling` guarantees the P6-G invariant: no stage is left at
 * `STARTED` without a terminal event, even if an unexpected throw escapes.
 */
export class TraceCollector {
  private readonly events: ProcessTraceEvent[] = [];
  private readonly open: OpenStageInternal[] = [];

  constructor(private readonly processId: string) {}

  /** Emit `STARTED` for a stage and return its handle. */
  start(
    stage: BusinessProcessStage,
    metadata?: Record<string, unknown>,
  ): OpenStage {
    const startedAtMs = Date.now();
    this.events.push({
      processId: this.processId,
      stage,
      status: 'STARTED',
      startedAt: new Date(startedAtMs).toISOString(),
      metadata: sanitizeTraceMetadata(metadata),
    });
    const handle: OpenStageInternal = { stage, startedAtMs, settled: false };
    this.open.push(handle);
    return handle;
  }

  /** Emit the single terminal event for an open stage. */
  settle(
    handle: OpenStage,
    status: Exclude<ProcessTraceStatus, 'STARTED'>,
    detail: {
      error?: ProcessError;
      metadata?: Record<string, unknown>;
    } = {},
  ): void {
    const internal = handle as OpenStageInternal;
    if (internal.settled) return; // never emit two terminal events for one stage
    internal.settled = true;
    const endedAtMs = Date.now();
    this.events.push({
      processId: this.processId,
      stage: handle.stage,
      status,
      startedAt: new Date(handle.startedAtMs).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
      durationMs: endedAtMs - handle.startedAtMs,
      error: detail.error,
      metadata: sanitizeTraceMetadata(detail.metadata),
    });
  }

  /**
   * Close any stage still at `STARTED` as `FAILED`. Called from the
   * orchestrator's outermost guard so the trace always has a terminal state.
   */
  finalizeDangling(error: ProcessError): void {
    for (const handle of this.open) {
      if (!handle.settled) {
        this.settle(handle, 'FAILED', { error: { ...error, stage: handle.stage } });
      }
    }
  }

  /** True when every started stage has a terminal event. */
  get allStagesSettled(): boolean {
    return this.open.every((h) => h.settled);
  }

  snapshot(): ProcessTraceEvent[] {
    return this.events.map((e) => ({ ...e }));
  }
}

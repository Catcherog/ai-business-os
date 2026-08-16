import type {
  BusinessProcessStatus,
  BusinessProcessStage,
  BusinessProcessOutput,
  ProcessExecutionRecord,
  ProcessError,
  ProcessRejection,
  ProcessTraceStatus,
} from '@busos/orchestrator';

/**
 * H1-03 presentation-only view models.
 *
 * These are derived 1:1 from the canonical P6 process contract
 * (`ProcessExecutionRecord` / `BusinessProcessResult`). They intentionally add NO
 * second business state machine — `RunStageViewStatus` is a *view* projection of
 * the canonical `BusinessProcessStatus` + `completedStages` + `currentStage`, and
 * `RunOutcomeView.kind` is a *view* projection of the canonical outcome
 * (system error vs business rejection vs human-required), never a new taxonomy.
 */

/** One row in the Runs list. */
export interface RunSummary {
  processId: string;
  status: BusinessProcessStatus;
  /** Current or last reached stage label — `'—'` when not yet known. */
  stage: BusinessProcessStage | '—';
  startedAt: string;
  /** `null` while RUNNING / not yet available. */
  durationMs: number | null;
  /** Short human summary of present output references. */
  outputSummary: string;
  /** `error.code` or `rejection.reasonCode` when present, else `null`. */
  outcomeSummary: string | null;
  deduplicated: boolean;
}

/** View projection of one stage's state in the detail view. */
export type RunStageViewStatus =
  | 'completed'
  | 'current'
  | 'not_reached'
  | 'failed'
  | 'rejected'
  | 'human_required';

export interface RunStageView {
  stage: BusinessProcessStage;
  status: RunStageViewStatus;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
}

/** One structured trace row in the detail view (not a raw log dump). */
export interface RunTraceEventView {
  stage: BusinessProcessStage;
  status: ProcessTraceStatus;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  /** Sanitized `error.code` when the event carried an error. */
  errorCode?: string;
  /** Allowlisted-only metadata (defence-in-depth re-sanitized). */
  metadata: Record<string, unknown> | undefined;
}

/** View projection of the canonical outcome — MUST keep system vs business distinct. */
export type RunOutcomeKind =
  | 'success'
  | 'running'
  | 'system_error'
  | 'business_rejection'
  | 'human_required';

export interface RunOutcomeView {
  kind: RunOutcomeKind;
  /** Present only for `kind === 'system_error'`. */
  error?: ProcessError;
  /** Present only for `kind === 'business_rejection' | 'human_required'`. */
  rejection?: ProcessRejection;
}

/** Full Run Detail payload rendered by the workspace UI. */
export interface RunDetail {
  processId: string;
  status: BusinessProcessStatus;
  startedAt: string;
  /** `null` while RUNNING / not available. */
  endedAt: string | null;
  durationMs: number | null;
  deduplicated: boolean;
  stages: RunStageView[];
  output: BusinessProcessOutput | null;
  outcome: RunOutcomeView;
  trace: RunTraceEventView[];
}

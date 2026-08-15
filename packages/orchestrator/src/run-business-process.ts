import { randomUUID } from 'node:crypto';
import {
  executeGoldenPath,
  buildCandidateFromInput,
  govern,
} from '@busos/golden-path';
import { convertLeadToProject } from '@busos/project-lifecycle';
import { executeCreativeProduction } from '@busos/creative-production';
import { TraceCollector } from './trace.js';
import { classifyFailure, errorMessage, invalidInputError } from './errors.js';
import { InMemoryProcessRegistry } from './process-registry.js';
import type { ProcessExecutionRecord, ProcessRegistry } from './process-registry.js';
import type {
  BusinessProcessOutput,
  BusinessProcessResult,
  BusinessProcessStage,
  BusinessProcessStatus,
  ProcessError,
  ProcessRejection,
} from './process-contract.js';
import type {
  OrchestratorDeps,
  OrchestratorInput,
  ProcessRunOptions,
} from './types.js';

/** Mutable bookkeeping for one execution. */
interface RunState {
  processId: string;
  idempotencyKey?: string;
  startedAtMs: number;
  startedAt: string;
  trace: TraceCollector;
  completedStages: BusinessProcessStage[];
  output: BusinessProcessOutput;
  currentStage: BusinessProcessStage;
  /** Resolved once (options first, then deps) and reused for every write. */
  registry?: ProcessRegistry;
}

/** Terminal outcome of one stage, expressed in orchestrator vocabulary. */
type StageOutcome =
  | { kind: 'OK' }
  | { kind: 'REJECTED'; rejection: ProcessRejection; human?: boolean }
  | { kind: 'FAILED'; error: ProcessError };

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Structural input validation. Deliberately narrow: it only rejects input that
 * could never form a valid call. Business eligibility (empty prompt, missing
 * source image, ineligible project, ...) stays with the slices, which express it
 * as a business REJECTION rather than a system FAILURE.
 */
function validateInput(input: OrchestratorInput): string | null {
  if (!input || typeof input !== 'object') return 'input is required';
  if (!input.goldenPath || typeof input.goldenPath !== 'object') {
    return 'input.goldenPath is required';
  }
  if (!nonEmptyString(input.goldenPath.text)) {
    return 'input.goldenPath.text must be a non-empty string';
  }
  if (!nonEmptyString(input.projectType)) {
    return 'input.projectType must be a non-empty string';
  }
  if (!nonEmptyString(input.projectTitle)) {
    return 'input.projectTitle must be a non-empty string';
  }
  if (typeof input.prompt !== 'string') return 'input.prompt must be a string';
  if (typeof input.sourceImageBase64 !== 'string') {
    return 'input.sourceImageBase64 must be a string';
  }
  if (typeof input.sourceImageMimeType !== 'string') {
    return 'input.sourceImageMimeType must be a string';
  }
  return null;
}

/** Leading `SOME_CODE` token of a documented slice reason string. */
function reasonCodeOf(reason: string | undefined, fallback: string): string {
  if (!reason) return fallback;
  const m = /^([A-Z][A-Z0-9_]{3,})/.exec(reason.trim());
  return m ? m[1] : fallback;
}

function buildResult(
  state: RunState,
  final: {
    status: BusinessProcessStatus;
    currentStage?: BusinessProcessStage;
    error?: ProcessError;
    rejection?: ProcessRejection;
    deduplicated?: boolean;
  },
): BusinessProcessResult {
  const endedAtMs = Date.now();
  const hasOutput = Object.values(state.output).some((v) => v !== undefined);
  return {
    processId: state.processId,
    idempotencyKey: state.idempotencyKey,
    status: final.status,
    currentStage: final.currentStage,
    completedStages: [...state.completedStages],
    startedAt: state.startedAt,
    endedAt: new Date(endedAtMs).toISOString(),
    durationMs: endedAtMs - state.startedAtMs,
    output: hasOutput ? { ...state.output } : undefined,
    error: final.error,
    rejection: final.rejection,
    trace: state.trace.snapshot(),
    deduplicated: final.deduplicated,
  };
}

/** Replay a previously recorded execution — performs NO downstream work. */
function replayRecord(
  record: ProcessExecutionRecord,
  idempotencyKey: string,
): BusinessProcessResult {
  if (record.result) {
    return { ...record.result, deduplicated: true };
  }
  // RUNNING with no stored result yet: deterministic duplicate response.
  const endedAtMs = Date.now();
  const startedAtMs = Date.parse(record.startedAt);
  return {
    processId: record.processId,
    idempotencyKey,
    status: record.status,
    currentStage: record.currentStage,
    completedStages: [],
    startedAt: record.startedAt,
    endedAt: new Date(endedAtMs).toISOString(),
    durationMs: Number.isFinite(startedAtMs) ? endedAtMs - startedAtMs : 0,
    trace: [],
    deduplicated: true,
  };
}

/**
 * Idempotency policy for an existing record.
 *
 * `REPLAY`      — return the recorded outcome, run nothing downstream.
 * `EXECUTE`     — explicit, owner-requested re-execution of a non-terminal failure.
 */
function duplicatePolicy(
  record: ProcessExecutionRecord,
  retryPreviousFailure: boolean,
): 'REPLAY' | 'EXECUTE' {
  if (record.status !== 'FAILED') {
    // RUNNING / SUCCEEDED / REJECTED / HUMAN_REQUIRED never re-execute.
    return 'REPLAY';
  }
  const disposition = record.result?.error?.disposition;
  if (disposition === 'TERMINAL' || disposition === undefined) {
    // Fail closed: a TERMINAL (or unclassifiable) failure is never re-run
    // automatically, and not even on explicit request — re-running cannot help
    // and may duplicate whatever side effects already landed.
    return 'REPLAY';
  }
  // RETRYABLE / EXTERNAL_DEPENDENCY: still no automatic re-run. This is the
  // explicit retry/resume EXTENSION POINT. P6-02 does not implement
  // partial-stage resume — an opt-in retry re-runs the process from the start.
  return retryPreviousFailure ? 'EXECUTE' : 'REPLAY';
}

/**
 * BUSOS-P6-02 — Business Process Orchestrator.
 *
 * Composes the existing vertical slices into one reliable runtime entrypoint:
 *
 *   Consultation -> GOLDEN_PATH        (Lead + Customer)
 *               -> PROJECT_LIFECYCLE   (Project + Task)
 *               -> CREATIVE_PRODUCTION (Asset + Task DONE)
 *
 * Guarantees (P6-02):
 *  - **Explicit state** — every run resolves to SUCCEEDED / REJECTED /
 *    HUMAN_REQUIRED / FAILED. A business rejection is never reported as a
 *    system failure.
 *  - **Fail closed** — stage N failing or being rejected stops stage N+1.
 *  - **Auditable trace** — each executed stage emits STARTED + exactly one
 *    terminal event with timing and classified error; metadata is allowlisted.
 *  - **Classified errors** — RETRYABLE / TERMINAL / EXTERNAL_DEPENDENCY.
 *  - **Idempotency** — with an `idempotencyKey` + `ProcessRegistry`, a duplicate
 *    call replays the recorded outcome instead of re-running downstream work.
 *  - **Never throws** — all faults are returned as a classified result.
 */
export async function runBusinessProcess(
  input: OrchestratorInput,
  deps: OrchestratorDeps,
  options: ProcessRunOptions = {},
): Promise<BusinessProcessResult> {
  const startedAtMs = Date.now();
  const processId = options.processId ?? `proc_${randomUUID()}`;
  const state: RunState = {
    processId,
    idempotencyKey: options.idempotencyKey,
    startedAtMs,
    startedAt: new Date(startedAtMs).toISOString(),
    trace: new TraceCollector(processId),
    completedStages: [],
    output: {},
    currentStage: 'GOLDEN_PATH',
    registry: options.registry ?? deps.processRegistry,
  };

  try {
    return await execute(input, deps, options, state);
  } catch (e) {
    // Defence in depth: an unexpected escape must still produce a terminal
    // trace and a classified result rather than an exception.
    const error = classifyFailure(state.currentStage, errorMessage(e));
    state.trace.finalizeDangling(error);
    const result = buildResult(state, {
      status: 'FAILED',
      currentStage: state.currentStage,
      error,
    });
    await persist(state, result);
    return result;
  }
}

async function execute(
  input: OrchestratorInput,
  deps: OrchestratorDeps,
  options: ProcessRunOptions,
  state: RunState,
): Promise<BusinessProcessResult> {
  const key = options.idempotencyKey;
  const registry = state.registry;

  // ---- Idempotency guard -------------------------------------------------
  if (key && !registry) {
    // Fail closed rather than silently dropping the idempotency guarantee.
    const error = invalidInputError(
      'GOLDEN_PATH',
      'idempotencyKey was supplied without a ProcessRegistry; idempotency cannot be honoured',
    );
    const handle = state.trace.start('GOLDEN_PATH', { idempotency: 'NO_REGISTRY' });
    state.trace.settle(handle, 'FAILED', { error });
    return buildResult(state, { status: 'FAILED', currentStage: 'GOLDEN_PATH', error });
  }

  if (key && registry) {
    let existing: ProcessExecutionRecord | null;
    try {
      existing = await registry.getByIdempotencyKey(key);
    } catch (e) {
      const error = classifyFailure('GOLDEN_PATH', errorMessage(e), {
        code: 'REGISTRY_FAILURE',
        disposition: 'RETRYABLE',
      });
      const handle = state.trace.start('GOLDEN_PATH', { idempotency: 'LOOKUP_FAILED' });
      state.trace.settle(handle, 'FAILED', { error });
      return buildResult(state, { status: 'FAILED', currentStage: 'GOLDEN_PATH', error });
    }

    if (existing && duplicatePolicy(existing, options.retryPreviousFailure === true) === 'REPLAY') {
      return replayRecord(existing, key);
    }

    // Mark in-flight BEFORE any downstream side effect, so a concurrent
    // duplicate observes RUNNING instead of starting a second execution.
    await registry.save({
      idempotencyKey: key,
      processId: state.processId,
      status: 'RUNNING',
      startedAt: state.startedAt,
      updatedAt: new Date().toISOString(),
      currentStage: 'GOLDEN_PATH',
    });
  }

  // ---- Structural input validation (TERMINAL) ----------------------------
  const invalid = validateInput(input);
  if (invalid) {
    const error = invalidInputError('GOLDEN_PATH', invalid);
    const handle = state.trace.start('GOLDEN_PATH');
    state.trace.settle(handle, 'FAILED', { error });
    const result = buildResult(state, {
      status: 'FAILED',
      currentStage: 'GOLDEN_PATH',
      error,
    });
    await persist(state, result);
    return result;
  }

  const candidateBuilder = deps.candidateBuilder ?? buildCandidateFromInput;
  const governance = deps.governance ?? govern;
  const repo = deps.businessRepository;

  // ---- Stage 1 — GOLDEN_PATH (Lead + Customer) ---------------------------
  state.currentStage = 'GOLDEN_PATH';
  const gpHandle = state.trace.start('GOLDEN_PATH');
  let gpOutcome: StageOutcome;
  let leadId: string | undefined;

  try {
    const gp = await executeGoldenPath(input.goldenPath, {
      candidateBuilder,
      governance,
      businessRepository: repo,
    });

    if (gp.status === 'SUCCESS' && gp.lead) {
      leadId = gp.lead.lead_id;
      state.output.leadId = leadId;
      state.output.customerId = gp.customer?.customer_id;
      gpOutcome = { kind: 'OK' };
      state.trace.settle(gpHandle, 'SUCCEEDED', {
        metadata: {
          leadId,
          customerId: gp.customer?.customer_id,
          governanceDecision: gp.governance?.decision,
          leadWrites: gp.writes?.lead,
          customerWrites: gp.writes?.customer,
          linkWrites: gp.writes?.link,
          sliceStatus: gp.status,
        },
      });
    } else if (gp.status === 'BLOCKED') {
      // Business outcome, NOT a system failure. REVIEW_REQUIRED means a human
      // must decide; anything else is a business rejection.
      const decision = gp.governance?.decision;
      const human =
        decision === 'REVIEW_REQUIRED' ||
        /REVIEW_REQUIRED/.test(gp.failureReason ?? '');
      const rejection: ProcessRejection = {
        stage: 'GOLDEN_PATH',
        reasonCode: decision ?? reasonCodeOf(gp.failureReason, 'BLOCKED'),
        message: gp.failureReason ?? 'golden path blocked',
      };
      gpOutcome = { kind: 'REJECTED', rejection, human };
      state.trace.settle(gpHandle, human ? 'HUMAN_REQUIRED' : 'REJECTED', {
        metadata: {
          governanceDecision: decision,
          reasonCode: rejection.reasonCode,
          sliceStatus: gp.status,
        },
      });
    } else {
      const error = classifyFailure(
        'GOLDEN_PATH',
        gp.failureReason ?? 'golden path failed without a reason',
      );
      gpOutcome = { kind: 'FAILED', error };
      state.trace.settle(gpHandle, 'FAILED', {
        error,
        metadata: { sliceStatus: gp.status },
      });
    }
  } catch (e) {
    const error = classifyFailure('GOLDEN_PATH', errorMessage(e));
    gpOutcome = { kind: 'FAILED', error };
    state.trace.settle(gpHandle, 'FAILED', { error });
  }

  if (gpOutcome.kind !== 'OK' || !leadId) {
    return finish(state, 'GOLDEN_PATH', gpOutcome);
  }
  state.completedStages.push('GOLDEN_PATH');

  // ---- Stage 2 — PROJECT_LIFECYCLE (Project + Task) ----------------------
  state.currentStage = 'PROJECT_LIFECYCLE';
  const plHandle = state.trace.start('PROJECT_LIFECYCLE', { leadId });
  let plOutcome: StageOutcome;
  let projectId: string | undefined;

  try {
    const conv = await convertLeadToProject(
      {
        lead_id: leadId,
        project_type: input.projectType,
        title: input.projectTitle,
        scheduled_date: input.scheduledDate,
      },
      { businessRepository: repo },
    );

    if (conv.status === 'LIFECYCLE_SUCCESS' && conv.project) {
      projectId = conv.project.project_id;
      state.output.projectId = projectId;
      plOutcome = { kind: 'OK' };
      state.trace.settle(plHandle, 'SUCCEEDED', {
        metadata: {
          leadId,
          projectId,
          taskId: conv.task?.task_id,
          projectWrites: conv.writes?.project,
          taskWrites: conv.writes?.task,
          sliceStatus: conv.status,
        },
      });
    } else if (conv.status === 'BLOCKED') {
      const rejection: ProcessRejection = {
        stage: 'PROJECT_LIFECYCLE',
        reasonCode: reasonCodeOf(conv.reason, 'BLOCKED'),
        message: conv.reason ?? 'lead not eligible for conversion',
      };
      plOutcome = { kind: 'REJECTED', rejection };
      state.trace.settle(plHandle, 'REJECTED', {
        metadata: { leadId, reasonCode: rejection.reasonCode, sliceStatus: conv.status },
      });
    } else {
      const error = classifyFailure(
        'PROJECT_LIFECYCLE',
        conv.reason ?? 'project lifecycle failed without a reason',
      );
      plOutcome = { kind: 'FAILED', error };
      state.trace.settle(plHandle, 'FAILED', {
        error,
        metadata: { leadId, sliceStatus: conv.status },
      });
    }
  } catch (e) {
    const error = classifyFailure('PROJECT_LIFECYCLE', errorMessage(e));
    plOutcome = { kind: 'FAILED', error };
    state.trace.settle(plHandle, 'FAILED', { error, metadata: { leadId } });
  }

  if (plOutcome.kind !== 'OK' || !projectId) {
    return finish(state, 'PROJECT_LIFECYCLE', plOutcome);
  }
  state.completedStages.push('PROJECT_LIFECYCLE');

  // ---- Stage 3 — CREATIVE_PRODUCTION (Asset + Task DONE) -----------------
  state.currentStage = 'CREATIVE_PRODUCTION';
  const cpHandle = state.trace.start('CREATIVE_PRODUCTION', { projectId });
  let cpOutcome: StageOutcome;

  try {
    const creative = await executeCreativeProduction(
      {
        project_id: projectId,
        prompt: input.prompt,
        source_image_base64: input.sourceImageBase64,
        source_image_mime_type: input.sourceImageMimeType,
        title: input.creativeTitle,
      },
      { businessRepository: repo, lumen: deps.lumen },
    );

    if (creative.status === 'CREATIVE_SUCCESS' && creative.asset) {
      state.output.taskId = creative.task?.task_id;
      state.output.assetId = creative.asset.asset_id;
      state.output.assetUri = creative.asset.asset_uri ?? undefined;
      cpOutcome = { kind: 'OK' };
      state.trace.settle(cpHandle, 'SUCCEEDED', {
        metadata: {
          projectId,
          taskId: creative.task?.task_id,
          assetId: creative.asset.asset_id,
          assetWrites: creative.writes?.asset,
          taskWrites: creative.writes?.task,
          sliceStatus: creative.status,
        },
      });
    } else if (creative.status === 'BLOCKED') {
      const rejection: ProcessRejection = {
        stage: 'CREATIVE_PRODUCTION',
        reasonCode: reasonCodeOf(creative.reason, 'BLOCKED'),
        message: creative.reason ?? 'project not eligible for creative production',
      };
      cpOutcome = { kind: 'REJECTED', rejection };
      state.trace.settle(cpHandle, 'REJECTED', {
        metadata: {
          projectId,
          reasonCode: rejection.reasonCode,
          sliceStatus: creative.status,
        },
      });
    } else {
      const error = classifyFailure(
        'CREATIVE_PRODUCTION',
        creative.reason ?? 'creative production failed without a reason',
      );
      cpOutcome = { kind: 'FAILED', error };
      state.trace.settle(cpHandle, 'FAILED', {
        error,
        metadata: { projectId, sliceStatus: creative.status },
      });
    }
  } catch (e) {
    const error = classifyFailure('CREATIVE_PRODUCTION', errorMessage(e));
    cpOutcome = { kind: 'FAILED', error };
    state.trace.settle(cpHandle, 'FAILED', { error, metadata: { projectId } });
  }

  if (cpOutcome.kind !== 'OK') {
    return finish(state, 'CREATIVE_PRODUCTION', cpOutcome);
  }
  state.completedStages.push('CREATIVE_PRODUCTION');

  const result = buildResult(state, { status: 'SUCCEEDED' });
  await persist(state, result);
  return result;
}

/** Build + persist the terminal result for a non-OK stage outcome. */
async function finish(
  state: RunState,
  stage: BusinessProcessStage,
  outcome: StageOutcome,
): Promise<BusinessProcessResult> {
  let result: BusinessProcessResult;
  if (outcome.kind === 'REJECTED') {
    result = buildResult(state, {
      status: outcome.human ? 'HUMAN_REQUIRED' : 'REJECTED',
      currentStage: stage,
      rejection: outcome.rejection,
    });
  } else if (outcome.kind === 'FAILED') {
    result = buildResult(state, {
      status: 'FAILED',
      currentStage: stage,
      error: outcome.error,
    });
  } else {
    // Reached only when a stage reported success without its required entity.
    const error = classifyFailure(stage, `${stage} succeeded without a committed entity`);
    result = buildResult(state, { status: 'FAILED', currentStage: stage, error });
  }
  await persist(state, result);
  return result;
}

/**
 * Record the terminal outcome under the idempotency key.
 *
 * Best-effort by design: the downstream work has already happened, so a registry
 * write failure must not rewrite a truthful business result. The consequence is
 * bounded and documented — that key simply loses replay protection.
 */
async function persist(
  state: RunState,
  result: BusinessProcessResult,
): Promise<void> {
  const key = state.idempotencyKey;
  const registry = state.registry;
  if (!key || !registry) return;
  try {
    await registry.save({
      idempotencyKey: key,
      processId: state.processId,
      status: result.status,
      startedAt: result.startedAt,
      updatedAt: new Date().toISOString(),
      currentStage: result.currentStage,
      result,
    });
  } catch {
    // intentionally swallowed — see doc comment above
  }
}

export { InMemoryProcessRegistry };
export type { ProcessRegistry, ProcessExecutionRecord };

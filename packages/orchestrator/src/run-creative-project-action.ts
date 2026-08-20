/**
 * BUSOS-R2-H1-04 — Narrow Creative-Project Action entry.
 *
 * This is NOT a second state machine and NOT a generic Action framework. It is
 * the single, bounded entry the Operator Workspace uses to run "Generate Visual
 * Reference" against an EXISTING Project. It deliberately does NOT call
 * `runBusinessProcess` (which would recreate the Lead/Project) — it executes
 * only the `CREATIVE_PRODUCTION` slice.
 *
 * Reused P6 primitives (no re-implementation):
 *   - `TraceCollector` / `sanitizeTraceMetadata` (allowlist) for the auditable trace
 *   - `classifyFailure` / `invalidInputError` for error classification
 *   - `ProcessRegistry` + `InMemoryProcessRegistry` for idempotency
 *   - `BusinessProcessResult` / `BusinessProcessStatus` / `BusinessProcessOutput` contract
 *
 * Safety invariants (req #4/#5):
 *   - Never throws — every fault becomes a classified result.
 *   - The trace only carries allowlisted stable references (projectId, taskId,
 *     assetId, idempotency, reasonCode). `prompt`, `source_image_base64`,
 *     secrets, and raw third-party responses are NEVER emitted.
 *   - `executeCreativeProduction` itself emits no trace and performs the bounded
 *     Project -> Task -> Lumen -> Asset -> Task DONE path with readback.
 */
import { randomUUID } from 'node:crypto';
import type { BusinessRepository } from '@busos/business-repository';
import type { LumenPort } from '@busos/lumen-adapter';
import { executeCreativeProduction } from '@busos/creative-production';
import type { MemoryService, MemoryContext, MemoryContextSummary } from '@busos/memory';
import { assembleMemoryContext, toMemoryContextSummary } from '@busos/memory';
import type { ProcessRegistry, ProcessExecutionRecord } from './process-registry.js';
import type { ProcessRunOptions } from './types.js';
import type {
  BusinessProcessResult,
  BusinessProcessStage,
  ProcessError,
} from './process-contract.js';
import { TraceCollector } from './trace.js';
import { classifyFailure, invalidInputError, errorMessage } from './errors.js';

const STAGE: BusinessProcessStage = 'CREATIVE_PRODUCTION';

/** Input for the narrow creative-project action. */
export interface CreativeProjectActionInput {
  /** Existing Project id (never created by this action). */
  projectId: string;
  /** Editing instruction sent to Lumen. Kept SEPARATE from governed memory context. */
  prompt: string;
  /** Exactly one source image, base64. */
  sourceImageBase64: string;
  sourceImageMimeType: string;
  /** Optional human-readable title for the creative task. */
  title?: string;
  /**
   * H2-02 — the customer this project belongs to. Supplied by the caller so the
   * governed memory context can be scoped to (project, customer). When absent, no
   * governed memory context is assembled (graceful — `memory_context_used:false`).
   */
  customerId?: string;
}

/** Dependencies for the narrow action — a subset of `OrchestratorDeps`. */
export interface CreativeProjectActionDeps {
  businessRepository: BusinessRepository;
  lumen: LumenPort;
  processRegistry?: ProcessRegistry;
  /**
   * H2-02 — the canonical governed Memory service. When present (together with
   * `input.customerId`), the action assembles the governed memory context and
   * hands it to the creative slice as a SEPARATE, auditable business-context
   * input (never concatenated into the user prompt).
   */
  memory?: MemoryService;
}

/**
 * Run "Generate Visual Reference" against an existing Project.
 *
 * Idempotency: with a stable `idempotencyKey` + `ProcessRegistry`, a duplicate
 * call replays the recorded outcome instead of re-running downstream work — so a
 * double-click cannot create a second Task/Asset. A key supplied without a
 * registry fails closed (the guarantee is honoured, not silently dropped).
 */
/**
 * Build the allowlisted trace metadata for the governed memory context. The trace
 * carries ONLY stable references (count, pipe-joined memory ids, types,
 * truncation flag) — never content, prompt, credential, or raw third-party
 * payload. When no memory was in scope, it records `memory_context_used:false`.
 */
function memoryTraceMeta(ctx: MemoryContext | null): Record<string, unknown> {
  if (!ctx || ctx.count === 0) {
    return {
      memory_context_used: false,
      memory_count: 0,
      memory_refs: '',
      memory_types: '',
      memory_truncated: false,
    };
  }
  return {
    memory_context_used: true,
    memory_count: ctx.count,
    memory_refs: ctx.records.map((r) => r.memory_id).join('|'),
    memory_types: [...new Set(ctx.records.map((r) => r.memory_type))].join('|'),
    memory_truncated: ctx.truncated,
  };
}

export async function runCreativeProjectAction(
  input: CreativeProjectActionInput,
  deps: CreativeProjectActionDeps,
  options: ProcessRunOptions = {},
): Promise<BusinessProcessResult> {
  const startedAtMs = Date.now();
  const startedAtIso = new Date(startedAtMs).toISOString();
  const processId = options.processId ?? `proc_${randomUUID()}`;
  const trace = new TraceCollector(processId);
  const registry = options.registry ?? deps.processRegistry;
  const key = options.idempotencyKey;

  // Mutable result scaffold; finalised by `finish` (which snapshots the trace).
  const result: BusinessProcessResult = {
    processId,
    idempotencyKey: key,
    status: 'FAILED',
    completedStages: [],
    startedAt: startedAtIso,
    endedAt: startedAtIso,
    durationMs: 0,
    trace: [],
  };

  const finish = (
    patch: Partial<BusinessProcessResult> & { status: BusinessProcessResult['status'] },
  ): BusinessProcessResult => {
    const endedAtMs = Date.now();
    result.endedAt = new Date(endedAtMs).toISOString();
    result.durationMs = endedAtMs - startedAtMs;
    result.trace = trace.snapshot();
    Object.assign(result, patch);
    return result;
  };

  const persist = async (
    status: BusinessProcessResult['status'],
    currentStage: BusinessProcessStage | undefined,
  ): Promise<void> => {
    if (!registry || !key) return;
    try {
      await registry.save({
        idempotencyKey: key,
        processId,
        status,
        startedAt: startedAtIso,
        updatedAt: new Date().toISOString(),
        currentStage,
        result,
      });
    } catch {
      /* best-effort: registry failure must not mask the business outcome */
    }
  };

  // ---- Idempotency guard -------------------------------------------------
  if (key && !registry) {
    const error = invalidInputError(
      STAGE,
      'idempotencyKey was supplied without a ProcessRegistry; idempotency cannot be honoured',
    );
    const handle = trace.start(STAGE, { idempotency: 'NO_REGISTRY' });
    trace.settle(handle, 'FAILED', { error });
    const r = finish({ status: 'FAILED', currentStage: STAGE, error });
    await persist('FAILED', STAGE);
    return r;
  }

  if (key && registry) {
    let existing: ProcessExecutionRecord | null = null;
    try {
      existing = await registry.getByIdempotencyKey(key);
    } catch (e) {
      const error = classifyFailure(STAGE, errorMessage(e), {
        code: 'REGISTRY_FAILURE',
        disposition: 'RETRYABLE',
      });
      const handle = trace.start(STAGE, { idempotency: 'LOOKUP_FAILED' });
      trace.settle(handle, 'FAILED', { error });
      return finish({ status: 'FAILED', currentStage: STAGE, error });
    }

    if (existing) {
      // Replay the recorded outcome — NO downstream side effect is performed.
      // This is the dedup guarantee: a duplicate click sees the first result.
      return {
        ...(existing.result as BusinessProcessResult),
        processId: existing.processId,
        idempotencyKey: key,
        deduplicated: true,
      };
    }

    // Mark in-flight BEFORE any downstream side effect, so a concurrent
    // duplicate observes RUNNING instead of starting a second execution.
    try {
      await registry.save({
        idempotencyKey: key,
        processId,
        status: 'RUNNING',
        startedAt: startedAtIso,
        updatedAt: new Date().toISOString(),
        currentStage: STAGE,
      });
    } catch {
      /* best-effort in-flight mark; the terminal persist still records the outcome */
    }
  }

  // ---- Governed Memory Context (H2-02) -------------------------------------
  // Assemble the bounded, deterministic, auditable context scoped to this
  // (project, customer). Fail-closed: if memory was explicitly wired (both the
  // service and the customer id are present) but assembly cannot be trusted, the
  // action must not silently proceed with unverified governance — it fails closed.
  let memoryContext: MemoryContext | null = null;
  let governedSummary: MemoryContextSummary | null = null;
  if (deps.memory && input.customerId) {
    try {
      memoryContext = await assembleMemoryContext(
        deps.memory,
        { projectId: input.projectId, customerId: input.customerId },
        { now: () => startedAtIso },
      );
      governedSummary = toMemoryContextSummary(memoryContext);
    } catch (e) {
      const error = classifyFailure(STAGE, `MEMORY_CONTEXT_FAILED:${errorMessage(e)}`);
      const handle = trace.start(STAGE, {
        projectId: input.projectId,
        idempotency: key ?? 'none',
        memory_context_used: false,
      });
      trace.settle(handle, 'FAILED', { error, metadata: { projectId: input.projectId } });
      const r = finish({ status: 'FAILED', currentStage: STAGE, error });
      await persist('FAILED', STAGE);
      return r;
    }
  }

  // ---- Execute the bounded CREATIVE_PRODUCTION slice ----------------------
  const handle = trace.start(STAGE, {
    projectId: input.projectId,
    idempotency: key ?? 'none',
    ...memoryTraceMeta(memoryContext),
  });

  let creative;
  try {
    creative = await executeCreativeProduction(
      {
        project_id: input.projectId,
        prompt: input.prompt,
        source_image_base64: input.sourceImageBase64,
        source_image_mime_type: input.sourceImageMimeType,
        title: input.title,
        // H2-02 — governed memory context as a SEPARATE, auditable business input.
        // It is NEVER concatenated into `prompt` (the user action input).
        governedMemoryContext: governedSummary ?? undefined,
      },
      {
        businessRepository: deps.businessRepository,
        lumen: deps.lumen,
      },
    );
  } catch (e) {
    const error = classifyFailure(STAGE, errorMessage(e));
    trace.settle(handle, 'FAILED', { error, metadata: { projectId: input.projectId } });
    const r = finish({ status: 'FAILED', currentStage: STAGE, error });
    await persist('FAILED', STAGE);
    return r;
  }

  // ---- Map slice outcome -> BusinessProcessResult ------------------------
  if (creative.status === 'CREATIVE_SUCCESS') {
    const taskId = creative.task?.task_id;
    const assetId = creative.asset?.asset_id;
    const assetUri = creative.asset?.asset_uri;
    trace.settle(handle, 'SUCCEEDED', {
      metadata: {
        projectId: creative.projectId,
        taskId,
        assetId,
        idempotency: key ?? 'none',
      },
    });
    const r = finish({
      status: 'SUCCEEDED',
      completedStages: [STAGE],
      output: {
        projectId: creative.projectId,
        taskId,
        assetId,
        assetUri,
        // H2-02 — minimal, trace/UI-safe summary of the governed memory consumed.
        ...(governedSummary ? { governedMemory: governedSummary } : {}),
      },
    });
    await persist('SUCCEEDED', undefined);
    return r;
  }

  if (creative.status === 'BLOCKED') {
    // Business rejection (ineligible project / empty prompt / empty image).
    // Working as designed — NOT a system fault.
    const reasonCode = (creative.reason ?? 'BLOCKED').split(':')[0];
    trace.settle(handle, 'REJECTED', {
      metadata: {
        projectId: creative.projectId,
        reasonCode,
        idempotency: key ?? 'none',
      },
    });
    const rejection = {
      stage: STAGE,
      reasonCode,
      message: creative.reason ?? 'BLOCKED',
    };
    const r = finish({ status: 'REJECTED', currentStage: STAGE, rejection });
    await persist('REJECTED', STAGE);
    return r;
  }

  // FAILED — a system/integration fault. The documented reason code drives
  // classification (e.g. LUMEN_GENERATION_FAILED -> CREATIVE_GENERATION_FAILED).
  const error: ProcessError = classifyFailure(STAGE, creative.reason ?? 'CREATIVE_PRODUCTION_FAILED');
  trace.settle(handle, 'FAILED', {
    error,
    metadata: { projectId: creative.projectId, idempotency: key ?? 'none' },
  });
  const r = finish({ status: 'FAILED', currentStage: STAGE, error });
  await persist('FAILED', STAGE);
  return r;
}

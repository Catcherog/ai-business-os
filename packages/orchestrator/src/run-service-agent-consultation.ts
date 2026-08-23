/**
 * BUSOS-R2-SCS-INTEGRATION-01 — Service Agent Consultation narrow entry.
 *
 * The first REAL customer-service vertical slice: BUSOS runs the frozen Service
 * Agent (LangGraph, `Catcherog/service-agent` FREEZE_SHA ebb85686) as a
 * synchronous AI capability and maps its structured result back into a
 * canonical BUSOS Run.
 *
 * This is NOT a second state machine and NOT a generic Action framework. It is
 * the single, bounded entry for "run one customer-service inference". It does
 * NOT call `runBusinessProcess` (which would recreate the Lead/Project) and it
 * does NOT extend the consultation pipeline — `SERVICE_AGENT` is a narrow
 * vertical slice stage, excluded from `PROCESS_STAGE_ORDER`.
 *
 * Reused P6 primitives (no re-implementation):
 *   - `TraceCollector` / `sanitizeTraceMetadata` (allowlist) for the auditable trace
 *   - `classifyFailure` / `invalidInputError` for error classification
 *   - `ProcessRegistry` + `InMemoryProcessRegistry` for idempotency
 *   - `BusinessProcessResult` / `BusinessProcessStatus` / `BusinessProcessOutput` contract
 *
 * Safety invariants (AC-07 / AC-08):
 *   - Never throws — every fault becomes a classified result.
 *   - A result that needs a human (R2/R3 risk, must_handoff, needs_clarification,
 *     needs_human_confirm) is NEVER reported as a plain SUCCEEDED answer — it is
 *     mapped to `HUMAN_REQUIRED` with a structured rejection.
 *   - Idempotency: with an `idempotencyKey` + `ProcessRegistry`, a duplicate
 *     call replays the recorded outcome instead of re-running the agent. The
 *     agent call itself is read-only inference; the run/request id from the
 *     agent (`trace.runId` / `trace.requestId`) is carried into the output for
 *     provenance (AC-13).
 *   - Trace metadata only carries allowlisted stable refs (run/request/
 *     conversation ids, intent/risk/route, handoff flags, canonical answer id,
 *     retrieval score). The customer message, the raw answer text, prompts,
 *     secrets and retrieval payloads are NEVER emitted.
 */
import { randomUUID } from 'node:crypto';

import type { ServiceAgentPort, ServiceAgentRunInput } from '@busos/service-agent-port';
import type { ProcessRegistry, ProcessExecutionRecord } from './process-registry.js';
import type { ProcessRunOptions } from './types.js';
import type {
  BusinessProcessResult,
  BusinessProcessStage,
  ProcessError,
  ProcessRejection,
  ServiceAgentOutputSummary,
} from './process-contract.js';
import { TraceCollector } from './trace.js';
import { classifyFailure, invalidInputError, errorMessage } from './errors.js';

const STAGE: BusinessProcessStage = 'SERVICE_AGENT';

/** Input for the Service Agent consultation narrow action. */
export interface ServiceAgentConsultationInput {
  /** The customer message (AgentState.message). */
  query: string;
  /** Optional caller-supplied conversation id (passed through to the agent). */
  conversationId?: string;
  /** The customer this consultation belongs to. */
  customerId?: string;
  /** Optional bounded multi-turn context (AgentState.conversation_history). */
  conversation?: ServiceAgentRunInput['conversation'];
  /** Retrieval breadth (AgentState.top_k, 1..10). */
  topK?: number;
}

/** Dependencies for the narrow action. */
export interface ServiceAgentConsultationDeps {
  /** The ServiceAgentPort — BUSOS core depends only on this boundary (AC-01). */
  serviceAgent: ServiceAgentPort;
  processRegistry?: ProcessRegistry;
}

/**
 * Project a Service Agent result into the UI/trace-safe output summary.
 * Keeps only stable refs + bounded answer; never the customer message or
 * raw retrieval payloads.
 */
function toServiceAgentSummary(result: {
  answer: string;
  intent: string;
  risk: string;
  route: string;
  handoff: {
    mustHandoff: boolean;
    needsClarification: boolean;
    answerRequiresDisclaimer: boolean;
    needsHumanConfirm: boolean;
  };
  evidence: {
    sourceModules: string[];
    retrievalScore: number;
    canonicalAnswerId: string | null;
    sourceBlockId: string | null;
    hasRetrievalEvidence: boolean;
  };
  trace: {
    runId: string;
    requestId: string;
    conversationId: string;
    latencyMs: number;
    llmUsed: boolean;
  };
}): ServiceAgentOutputSummary {
  return {
    answer: result.answer.slice(0, 1000),
    intent: result.intent,
    risk: result.risk,
    route: result.route,
    handoff: {
      mustHandoff: result.handoff.mustHandoff,
      needsClarification: result.handoff.needsClarification,
      answerRequiresDisclaimer: result.handoff.answerRequiresDisclaimer,
      needsHumanConfirm: result.handoff.needsHumanConfirm,
    },
    evidence: {
      sourceModules: result.evidence.sourceModules,
      retrievalScore: result.evidence.retrievalScore,
      canonicalAnswerId: result.evidence.canonicalAnswerId,
      sourceBlockId: result.evidence.sourceBlockId,
      hasRetrievalEvidence: result.evidence.hasRetrievalEvidence,
    },
    trace: {
      runId: result.trace.runId,
      requestId: result.trace.requestId,
      conversationId: result.trace.conversationId,
      latencyMs: result.trace.latencyMs,
      llmUsed: result.trace.llmUsed,
    },
  };
}

/** Structured trace metadata for a Service Agent run (allowlist-only keys). */
function traceMeta(
  summary: ServiceAgentOutputSummary,
  key: string | undefined,
): Record<string, unknown> {
  return {
    serviceAgentRunId: summary.trace.runId,
    serviceAgentRequestId: summary.trace.requestId,
    serviceAgentConversationId: summary.trace.conversationId,
    serviceAgentIntent: summary.intent,
    serviceAgentRisk: summary.risk,
    serviceAgentRoute: summary.route,
    serviceAgentMustHandoff: summary.handoff.mustHandoff,
    serviceAgentNeedsClarification: summary.handoff.needsClarification,
    serviceAgentAnswerRequiresDisclaimer: summary.handoff.answerRequiresDisclaimer,
    serviceAgentNeedsHumanConfirm: summary.handoff.needsHumanConfirm,
    serviceAgentCanonicalAnswerId: summary.evidence.canonicalAnswerId ?? undefined,
    serviceAgentSourceBlockId: summary.evidence.sourceBlockId ?? undefined,
    serviceAgentRetrievalScore: summary.evidence.retrievalScore,
    serviceAgentHasRetrievalEvidence: summary.evidence.hasRetrievalEvidence,
    serviceAgentLlmUsed: summary.trace.llmUsed,
    idempotency: key ?? 'none',
  };
}

/**
 * Run one Service Agent consultation and record it as a canonical BUSOS Run.
 *
 * Result mapping (AC-04 / AC-05 / AC-07):
 *   - A structured answer with NO human-review signal -> SUCCEEDED.
 *   - must_handoff / needs_clarification / needs_human_confirm (or risk
 *     R2/R3, which the agent itself routes to HUMAN_PATH) -> HUMAN_REQUIRED,
 *     never a plain success.
 *   - Agent/bridge/system fault -> FAILED (classified; never swallowed).
 */
export async function runServiceAgentConsultation(
  input: ServiceAgentConsultationInput,
  deps: ServiceAgentConsultationDeps,
  options: ProcessRunOptions = {},
): Promise<BusinessProcessResult> {
  const startedAtMs = Date.now();
  const startedAtIso = new Date(startedAtMs).toISOString();
  const processId = options.processId ?? `proc_${randomUUID()}`;
  const trace = new TraceCollector(processId);
  const registry = options.registry ?? deps.processRegistry;
  const key = options.idempotencyKey;

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
      return {
        ...(existing.result as BusinessProcessResult),
        processId: existing.processId,
        idempotencyKey: key,
        deduplicated: true,
      };
    }

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
      /* best-effort in-flight mark */
    }
  }

  // ---- Structural input validation (TERMINAL) ----------------------------
  if (!input.query || typeof input.query !== 'string' || input.query.trim() === '') {
    const error = invalidInputError(STAGE, 'input.query must be a non-empty string');
    const handle = trace.start(STAGE);
    trace.settle(handle, 'FAILED', { error });
    const r = finish({ status: 'FAILED', currentStage: STAGE, error });
    await persist('FAILED', STAGE);
    return r;
  }

  // ---- Execute the real Service Agent run --------------------------------
  const handle = trace.start(STAGE, {
    idempotency: key ?? 'none',
  });

  let agentResult;
  try {
    agentResult = await deps.serviceAgent.run({
      query: input.query,
      conversationId: input.conversationId,
      customerId: input.customerId,
      conversation: input.conversation,
      topK: input.topK,
    });
  } catch (e) {
    const error = classifyFailure(STAGE, errorMessage(e), {
      code: 'UPSTREAM_TEMPORARY_FAILURE',
      disposition: 'RETRYABLE',
    });
    trace.settle(handle, 'FAILED', { error });
    const r = finish({ status: 'FAILED', currentStage: STAGE, error });
    await persist('FAILED', STAGE);
    return r;
  }

  const summary = toServiceAgentSummary(agentResult);

  // ---- Map agent outcome -> canonical Run status (AC-07) -----------------
  // A human-review signal is a BUSINESS pause, never a system fault and never
  // a plain success. `must_handoff` / `needs_clarification` /
  // `needs_human_confirm` (and the agent's own risk R2/R3 routing) all mean
  // the answer is NOT a completed resolution.
  const needsHuman =
    summary.handoff.mustHandoff ||
    summary.handoff.needsClarification ||
    summary.handoff.needsHumanConfirm;

  if (needsHuman) {
    const reasonCode = summary.handoff.mustHandoff
      ? 'SERVICE_AGENT_HANDOFF'
      : summary.handoff.needsClarification
        ? 'SERVICE_AGENT_NEEDS_CLARIFICATION'
        : 'SERVICE_AGENT_NEEDS_HUMAN_CONFIRM';
    const rejection: ProcessRejection = {
      stage: STAGE,
      reasonCode,
      message:
        summary.handoff.mustHandoff
          ? 'Service Agent routed to a human (handoff required)'
          : summary.handoff.needsClarification
            ? 'Service Agent requires clarification before answering'
            : 'Service Agent flagged the answer for human confirmation',
    };
    trace.settle(handle, 'HUMAN_REQUIRED', {
      metadata: {
        ...traceMeta(summary, key),
        reasonCode,
      },
    });
    const r = finish({
      status: 'HUMAN_REQUIRED',
      currentStage: STAGE,
      rejection,
      output: {
        ...(input.customerId ? { customerId: input.customerId } : {}),
        serviceAgent: summary,
      },
    });
    await persist('HUMAN_REQUIRED', STAGE);
    return r;
  }

  // Plain structured answer — a completed resolution.
  trace.settle(handle, 'SUCCEEDED', {
    metadata: traceMeta(summary, key),
  });
  const r = finish({
    status: 'SUCCEEDED',
    completedStages: [STAGE],
    output: {
      ...(input.customerId ? { customerId: input.customerId } : {}),
      serviceAgent: summary,
    },
  });
  await persist('SUCCEEDED', undefined);
  return r;
}

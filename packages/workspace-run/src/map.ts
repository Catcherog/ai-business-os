import {
  PROCESS_STAGE_ORDER,
  sanitizeTraceMetadata,
  sanitizeMessage,
} from '@busos/orchestrator';
import type {
  BusinessProcessOutput,
  BusinessProcessStage,
  ProcessExecutionRecord,
  ProcessError,
  ProcessTraceEvent,
} from '@busos/orchestrator';
import type {
  RunDetail,
  RunOutcomeView,
  RunStageView,
  RunStageViewStatus,
  RunSummary,
  RunTraceEventView,
} from './types.js';

/**
 * Pure mapping from the canonical P6 process contract into H1-03 presentation
 * view models. No business logic, no second state machine — only projection.
 *
 * Security (H1-03-G): every trace event's metadata is re-sanitized through the
 * existing `sanitizeTraceMetadata` allowlist (defence-in-depth — the orchestrator
 * already sanitized it, but the presentation boundary re-applies it so a
 * malformed/forbidden record can never reach the UI). Error messages are
 * re-run through `sanitizeMessage`. The canonical error taxonomy is never altered.
 */

function computeDurationMs(
  rec: ProcessExecutionRecord,
  result: ProcessExecutionRecord['result'],
): number | null {
  // A RUNNING record has no terminal result — duration is not yet available.
  if (rec.status === 'RUNNING') return null;
  if (result?.durationMs != null && result.durationMs >= 0) return result.durationMs;
  const s = Date.parse(rec.startedAt);
  const e = Date.parse(rec.updatedAt);
  if (Number.isFinite(s) && Number.isFinite(e) && e >= s) return e - s;
  return null;
}

function summarizeOutput(output: BusinessProcessOutput | undefined): string {
  if (!output) return '—';
  const parts: string[] = [];
  if (output.leadId) parts.push('Lead');
  if (output.customerId) parts.push('Customer');
  if (output.projectId) parts.push('Project');
  if (output.taskId) parts.push('Task');
  if (output.assetId) parts.push('Asset');
  // BUSOS-R2-SCS-INTEGRATION-01 — Service Agent run marker.
  if (output.serviceAgent) parts.push('Service Agent');
  return parts.length ? parts.join(' · ') : '—';
}

/** Map a registry record to a Runs-list row. */
export function toRunSummary(rec: ProcessExecutionRecord): RunSummary {
  const r = rec.result;
  const stage: BusinessProcessStage | '—' =
    rec.currentStage ?? r?.completedStages[r.completedStages.length - 1] ?? '—';
  return {
    processId: rec.processId,
    status: rec.status,
    stage,
    startedAt: rec.startedAt,
    durationMs: computeDurationMs(rec, r),
    outputSummary: summarizeOutput(r?.output),
    outcomeSummary: r?.error ? r.error.code : r?.rejection ? r.rejection.reasonCode : null,
    deduplicated: r?.deduplicated ?? false,
    projectId: r?.output?.projectId ?? null,
  };
}

function mapStages(
  rec: ProcessExecutionRecord,
  result: ProcessExecutionRecord['result'],
): RunStageView[] {
  const completed = new Set(result?.completedStages ?? []);
  const current = rec.currentStage;
  const status = rec.status;
  const stages = PROCESS_STAGE_ORDER.map((stage): RunStageView => {
    let viewStatus: RunStageViewStatus;
    if (!result) {
      // RUNNING registry-only: only the current stage is known — do NOT fake
      // completion of the earlier stages (H1-03 detail honesty rule).
      viewStatus = stage === current ? 'current' : 'not_reached';
    } else if (completed.has(stage)) {
      viewStatus = 'completed';
    } else if (stage === current) {
      switch (status) {
        case 'FAILED':
          viewStatus = 'failed';
          break;
        case 'REJECTED':
          viewStatus = 'rejected';
          break;
        case 'HUMAN_REQUIRED':
          viewStatus = 'human_required';
          break;
        case 'RUNNING':
          viewStatus = 'current';
          break;
        default:
          viewStatus = 'not_reached';
      }
    } else {
      viewStatus = 'not_reached';
    }
    // Best-effort timing from the (already sanitized) terminal trace event.
    const ev = result?.trace?.find((e) => e.stage === stage && e.status !== 'STARTED');
    return {
      stage,
      status: viewStatus,
      startedAt: ev?.startedAt,
      endedAt: ev?.endedAt,
      durationMs: ev?.durationMs,
    };
  });

  // BUSOS-R2-SCS-INTEGRATION-01 — SERVICE_AGENT is a NARROW vertical slice
  // stage deliberately excluded from PROCESS_STAGE_ORDER (so the consultation
  // pipeline rendering stays untouched). When a run actually used it, append
  // its view after the pipeline stages so Run Detail shows it honestly.
  if (completed.has('SERVICE_AGENT') || current === 'SERVICE_AGENT') {
    let viewStatus: RunStageViewStatus;
    if (!result) {
      viewStatus = current === 'SERVICE_AGENT' ? 'current' : 'not_reached';
    } else if (completed.has('SERVICE_AGENT')) {
      viewStatus = 'completed';
    } else {
      switch (status) {
        case 'FAILED':
          viewStatus = 'failed';
          break;
        case 'HUMAN_REQUIRED':
          viewStatus = 'human_required';
          break;
        case 'RUNNING':
          viewStatus = 'current';
          break;
        default:
          viewStatus = 'not_reached';
      }
    }
    const ev = result?.trace?.find(
      (e) => e.stage === 'SERVICE_AGENT' && e.status !== 'STARTED',
    );
    stages.push({
      stage: 'SERVICE_AGENT',
      status: viewStatus,
      startedAt: ev?.startedAt,
      endedAt: ev?.endedAt,
      durationMs: ev?.durationMs,
    });
  }

  return stages;
}

function sanitizedError(err: ProcessError | undefined): ProcessError | undefined {
  if (!err) return undefined;
  return { ...err, message: sanitizeMessage(err.message) };
}

/**
 * The critical semantic gate (H1-03-F): project the canonical outcome into a
 * VIEW kind that the UI uses to decide presentation, WITHOUT ever letting a
 * business rejection / human-required be rendered as a system error.
 */
function mapOutcome(
  status: ProcessExecutionRecord['status'],
  result: ProcessExecutionRecord['result'],
): RunOutcomeView {
  switch (status) {
    case 'SUCCEEDED':
      return { kind: 'success' };
    case 'RUNNING':
      return { kind: 'running' };
    case 'FAILED':
      return { kind: 'system_error', error: sanitizedError(result?.error) };
    case 'REJECTED':
      return { kind: 'business_rejection', rejection: result?.rejection };
    case 'HUMAN_REQUIRED':
      return { kind: 'human_required', rejection: result?.rejection };
  }
}

function mapTraceEvent(e: ProcessTraceEvent): RunTraceEventView {
  return {
    stage: e.stage,
    status: e.status,
    startedAt: e.startedAt,
    endedAt: e.endedAt,
    durationMs: e.durationMs,
    errorCode: e.error?.code,
    // Defence-in-depth: re-apply the allowlist even though the orchestrator
    // already sanitized at emit time. Forbidden keys / objects / arrays / secrets
    // are dropped here, never reconstructable.
    metadata: e.metadata ? sanitizeTraceMetadata(e.metadata) : undefined,
  };
}

/** Map a registry record to a full Run Detail payload. */
export function toRunDetail(rec: ProcessExecutionRecord): RunDetail {
  const r = rec.result;
  const status = rec.status;
  const durationMs = computeDurationMs(rec, r);
  const endedAt = status === 'RUNNING' ? null : (r?.endedAt ?? rec.updatedAt);
  return {
    processId: rec.processId,
    status,
    startedAt: rec.startedAt,
    endedAt,
    durationMs,
    deduplicated: r?.deduplicated ?? false,
    stages: mapStages(rec, r),
    output: r?.output ?? null,
    outcome: mapOutcome(status, r),
    trace: (r?.trace ?? []).map(mapTraceEvent),
  };
}

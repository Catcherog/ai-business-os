import type {
  BusinessProcessOutput,
  BusinessProcessStage,
  ProcessError,
  ProcessExecutionRecord,
  ProcessRejection,
  ProcessTraceEvent,
  ProcessTraceStatus,
} from '@busos/orchestrator';

/**
 * Deterministic demo run dataset for the H1-03 Operator Workspace Runs surface.
 *
 * Four canonical executions are provided so the UI can demonstrate every
 * required state WITHOUT any live Feishu / Lumen credential:
 *   - proc_seed_a001  SUCCEEDED      (all 3 stages OK, full safe output)
 *   - proc_seed_b002  FAILED         (CREATIVE_GENERATION_FAILED at CREATIVE_PRODUCTION)
 *   - proc_seed_c003  RUNNING        (registry-only: no structured trace yet — honest)
 *   - proc_seed_d004  HUMAN_REQUIRED (governance REVIEW_REQUIRED at GOLDEN_PATH)
 *
 * Every record is a faithful `ProcessExecutionRecord` carrying a canonical
 * `BusinessProcessResult` — the SAME shape `runBusinessProcess` writes to the
 * shared `InMemoryProcessRegistry`. Trace metadata uses ONLY allowlisted stable
 * references (leadId / projectId / governanceDecision / reasonCode / ...). No
 * prompt / secret / raw third-party payload / credential appears anywhere.
 */

const A_START = Date.parse('2026-08-16T06:00:00Z');
const B_START = Date.parse('2026-08-16T07:30:00Z');
const C_START = Date.parse('2026-08-16T08:00:00Z');
const D_START = Date.parse('2026-08-16T09:15:00Z');

function traceEvent(
  processId: string,
  stage: BusinessProcessStage,
  status: ProcessTraceStatus,
  startMs: number,
  durationMs: number,
  extra: { error?: ProcessError; metadata?: Record<string, unknown> } = {},
): ProcessTraceEvent {
  return {
    processId,
    stage,
    status,
    startedAt: new Date(startMs).toISOString(),
    endedAt: new Date(startMs + durationMs).toISOString(),
    durationMs,
    ...extra,
  };
}

function buildSucceeded(): ProcessExecutionRecord {
  const pid = 'proc_seed_a001';
  const output: BusinessProcessOutput = {
    leadId: 'lead_seed_a',
    customerId: 'cust_seed_a',
    projectId: 'proj_seed_a',
    taskId: 'task_seed_a',
    assetId: 'asset_seed_a',
    assetUri: 'lumen://gen/seed-a-portrait-001',
  };
  return {
    idempotencyKey: 'run-seed-a',
    processId: pid,
    status: 'SUCCEEDED',
    startedAt: new Date(A_START).toISOString(),
    updatedAt: new Date(A_START + 5000).toISOString(),
    result: {
      processId: pid,
      idempotencyKey: 'run-seed-a',
      status: 'SUCCEEDED',
      completedStages: ['GOLDEN_PATH', 'PROJECT_LIFECYCLE', 'CREATIVE_PRODUCTION'],
      startedAt: new Date(A_START).toISOString(),
      endedAt: new Date(A_START + 5000).toISOString(),
      durationMs: 5000,
      output,
      trace: [
        traceEvent(pid, 'GOLDEN_PATH', 'STARTED', A_START, 0, {
          metadata: { leadId: 'lead_seed_a', customerId: 'cust_seed_a' },
        }),
        traceEvent(pid, 'GOLDEN_PATH', 'SUCCEEDED', A_START, 1200, {
          metadata: {
            leadId: 'lead_seed_a',
            customerId: 'cust_seed_a',
            governanceDecision: 'APPROVE',
            leadWrites: 1,
            customerWrites: 1,
            linkWrites: 1,
            sliceStatus: 'SUCCESS',
          },
        }),
        traceEvent(pid, 'PROJECT_LIFECYCLE', 'STARTED', A_START + 1200, 0, {
          metadata: { leadId: 'lead_seed_a' },
        }),
        traceEvent(pid, 'PROJECT_LIFECYCLE', 'SUCCEEDED', A_START + 1200, 1500, {
          metadata: {
            leadId: 'lead_seed_a',
            projectId: 'proj_seed_a',
            taskId: 'task_seed_a',
            projectWrites: 1,
            taskWrites: 1,
            sliceStatus: 'LIFECYCLE_SUCCESS',
          },
        }),
        traceEvent(pid, 'CREATIVE_PRODUCTION', 'STARTED', A_START + 2700, 0, {
          metadata: { projectId: 'proj_seed_a' },
        }),
        traceEvent(pid, 'CREATIVE_PRODUCTION', 'SUCCEEDED', A_START + 2700, 2300, {
          metadata: {
            projectId: 'proj_seed_a',
            taskId: 'task_seed_a',
            assetId: 'asset_seed_a',
            assetWrites: 1,
            taskWrites: 1,
            sliceStatus: 'CREATIVE_SUCCESS',
          },
        }),
      ],
    },
  };
}

function buildFailed(): ProcessExecutionRecord {
  const pid = 'proc_seed_b002';
  const error: ProcessError = {
    code: 'CREATIVE_GENERATION_FAILED',
    message: 'Lumen creative generation failed: provider returned no asset (generation rejected)',
    stage: 'CREATIVE_PRODUCTION',
    disposition: 'RETRYABLE',
  };
  return {
    idempotencyKey: 'run-seed-b',
    processId: pid,
    status: 'FAILED',
    currentStage: 'CREATIVE_PRODUCTION',
    startedAt: new Date(B_START).toISOString(),
    updatedAt: new Date(B_START + 3000).toISOString(),
    result: {
      processId: pid,
      idempotencyKey: 'run-seed-b',
      status: 'FAILED',
      currentStage: 'CREATIVE_PRODUCTION',
      completedStages: ['GOLDEN_PATH', 'PROJECT_LIFECYCLE'],
      startedAt: new Date(B_START).toISOString(),
      endedAt: new Date(B_START + 3000).toISOString(),
      durationMs: 3000,
      output: {
        // Creative production never completed — no asset reference.
        leadId: 'lead_seed_b',
        customerId: 'cust_seed_b',
        projectId: 'proj_seed_b',
        taskId: 'task_seed_b',
      },
      error,
      trace: [
        traceEvent(pid, 'GOLDEN_PATH', 'STARTED', B_START, 0),
        traceEvent(pid, 'GOLDEN_PATH', 'SUCCEEDED', B_START, 1000, {
          metadata: {
            leadId: 'lead_seed_b',
            customerId: 'cust_seed_b',
            governanceDecision: 'APPROVE',
            sliceStatus: 'SUCCESS',
          },
        }),
        traceEvent(pid, 'PROJECT_LIFECYCLE', 'STARTED', B_START + 1000, 0, {
          metadata: { leadId: 'lead_seed_b' },
        }),
        traceEvent(pid, 'PROJECT_LIFECYCLE', 'SUCCEEDED', B_START + 1000, 1200, {
          metadata: {
            leadId: 'lead_seed_b',
            projectId: 'proj_seed_b',
            taskId: 'task_seed_b',
            sliceStatus: 'LIFECYCLE_SUCCESS',
          },
        }),
        traceEvent(pid, 'CREATIVE_PRODUCTION', 'STARTED', B_START + 2200, 0, {
          metadata: { projectId: 'proj_seed_b' },
        }),
        traceEvent(pid, 'CREATIVE_PRODUCTION', 'FAILED', B_START + 2200, 800, {
          error,
          metadata: { projectId: 'proj_seed_b', sliceStatus: 'BLOCKED' },
        }),
      ],
    },
  };
}

/** RUNNING — registry-only. No `result` yet, so no structured trace is faked. */
function buildRunning(): ProcessExecutionRecord {
  return {
    idempotencyKey: 'run-seed-c',
    processId: 'proc_seed_c003',
    status: 'RUNNING',
    currentStage: 'CREATIVE_PRODUCTION',
    startedAt: new Date(C_START).toISOString(),
    updatedAt: new Date(C_START).toISOString(),
    // Intentionally NO `result` — honest in-flight representation.
  };
}

function buildHumanRequired(): ProcessExecutionRecord {
  const pid = 'proc_seed_d004';
  const rejection: ProcessRejection = {
    stage: 'GOLDEN_PATH',
    reasonCode: 'REVIEW_REQUIRED',
    message: '需要人工复核：客户身份缺失（无姓名/电话/微信）',
  };
  return {
    idempotencyKey: 'run-seed-d',
    processId: pid,
    status: 'HUMAN_REQUIRED',
    currentStage: 'GOLDEN_PATH',
    startedAt: new Date(D_START).toISOString(),
    updatedAt: new Date(D_START + 1000).toISOString(),
    result: {
      processId: pid,
      idempotencyKey: 'run-seed-d',
      status: 'HUMAN_REQUIRED',
      currentStage: 'GOLDEN_PATH',
      completedStages: [],
      startedAt: new Date(D_START).toISOString(),
      endedAt: new Date(D_START + 1000).toISOString(),
      durationMs: 1000,
      rejection,
      trace: [
        traceEvent(pid, 'GOLDEN_PATH', 'STARTED', D_START, 0),
        traceEvent(pid, 'GOLDEN_PATH', 'HUMAN_REQUIRED', D_START, 1000, {
          metadata: {
            governanceDecision: 'REVIEW_REQUIRED',
            reasonCode: 'REVIEW_REQUIRED',
            sliceStatus: 'BLOCKED',
          },
        }),
      ],
    },
  };
}

/**
 * Build the deterministic demo run records. Returns fresh objects on every call
 * so tests can seed a pristine registry per scenario.
 */
export function buildDemoRuns(): ProcessExecutionRecord[] {
  return [buildSucceeded(), buildFailed(), buildRunning(), buildHumanRequired()];
}

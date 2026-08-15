import {
  executeGoldenPath,
  buildCandidateFromInput,
  govern,
} from '@busos/golden-path';
import { convertLeadToProject } from '@busos/project-lifecycle';
import { executeCreativeProduction } from '@busos/creative-production';
import { TraceCollector } from './trace.js';
import type {
  OrchestratorDeps,
  OrchestratorInput,
  ProcessResult,
  ProcessStatus,
} from './types.js';

function toProcessStatus(status: string): ProcessStatus {
  return status === 'BLOCKED' ? 'BLOCKED' : 'FAILED';
}

/**
 * BUSOS-P6-01 — Orchestrator MVP.
 *
 * Composes the existing vertical slices into one runnable business process:
 *
 *   Consultation -> GoldenPath (Lead + Customer)
 *               -> ProjectLifecycle (Project + Task)
 *               -> CreativeProduction (Asset + Task DONE)
 *
 * using a single shared `BusinessRepository` (the canonical Feishu port) and a
 * single `LumenPort`. No existing package is modified — this is pure
 * composition plus a structured execution trace for observability. The trace
 * also sets up the deferred live CREATIVE_SUCCESS rerun on CloudBase quota
 * (BL-016): re-running this with real adapters becomes a single, inspectable
 * call instead of three separate manual runs.
 */
export async function runBusinessProcess(
  input: OrchestratorInput,
  deps: OrchestratorDeps,
): Promise<ProcessResult> {
  const trace = new TraceCollector();
  const candidateBuilder = deps.candidateBuilder ?? buildCandidateFromInput;
  const governance = deps.governance ?? govern;
  const repo = deps.businessRepository;

  // Stage 1 — Golden Path (Lead + Customer)
  const gp = await trace.stage(
    'GOLDEN_PATH',
    () =>
      executeGoldenPath(input.goldenPath, {
        candidateBuilder,
        governance,
        businessRepository: repo,
      }),
    (r) => r.status === 'SUCCESS' && !!r.lead,
  );
  if (gp.status !== 'SUCCESS' || !gp.lead) {
    return {
      status: toProcessStatus(gp.status),
      failedStage: 'GOLDEN_PATH',
      trace: trace.snapshot(),
      reason: gp.failureReason,
    };
  }

  // Stage 2 — Project Lifecycle (Project + Task)
  const conv = await trace.stage(
    'PROJECT_LIFECYCLE',
    () =>
      convertLeadToProject(
        {
          lead_id: gp.lead!.lead_id,
          project_type: input.projectType,
          title: input.projectTitle,
          scheduled_date: input.scheduledDate,
        },
        { businessRepository: repo },
      ),
    (r) => r.status === 'LIFECYCLE_SUCCESS' && !!r.project,
  );
  if (conv.status !== 'LIFECYCLE_SUCCESS' || !conv.project) {
    return {
      status: toProcessStatus(conv.status),
      failedStage: 'PROJECT_LIFECYCLE',
      leadId: gp.lead.lead_id,
      customerId: gp.customer?.customer_id,
      trace: trace.snapshot(),
      reason: conv.reason,
    };
  }

  // Stage 3 — Creative Production (Asset + Task DONE)
  const creative = await trace.stage(
    'CREATIVE_PRODUCTION',
    () =>
      executeCreativeProduction(
        {
          project_id: conv.project!.project_id,
          prompt: input.prompt,
          source_image_base64: input.sourceImageBase64,
          source_image_mime_type: input.sourceImageMimeType,
          title: input.creativeTitle,
        },
        { businessRepository: repo, lumen: deps.lumen },
      ),
    (r) => r.status === 'CREATIVE_SUCCESS' && !!r.asset,
  );
  if (creative.status !== 'CREATIVE_SUCCESS' || !creative.asset) {
    return {
      status: toProcessStatus(creative.status),
      failedStage: 'CREATIVE_PRODUCTION',
      leadId: gp.lead.lead_id,
      customerId: gp.customer?.customer_id,
      projectId: conv.project.project_id,
      trace: trace.snapshot(),
      reason: creative.reason,
    };
  }

  return {
    status: 'SUCCESS',
    failedStage: null,
    leadId: gp.lead.lead_id,
    customerId: gp.customer?.customer_id,
    projectId: conv.project.project_id,
    taskId: creative.task?.task_id,
    assetId: creative.asset.asset_id,
    assetUri: creative.asset.asset_uri ?? undefined,
    trace: trace.snapshot(),
  };
}

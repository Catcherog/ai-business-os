/**
 * H1-04 — Operator Workspace "Generate Visual Reference" action (DEMO mode).
 *
 * Runs the narrow `runCreativeProjectAction` against the SHARED in-memory fake
 * repository + fake Lumen adapter, recording the run in the SHARED
 * `InMemoryProcessRegistry` so it appears on the Runs surface. This is the
 * in-browser DEMO path: no Feishu/Lumen secrets ever cross the client boundary.
 *
 * The server-only CONNECTED boundary (RealFeishuAdapter / RealLumenAdapter from
 * env) lives under `server/` and is NEVER bundled into this browser code.
 */
import { runCreativeProjectAction, type BusinessProcessResult } from '@busos/orchestrator';
import { createFakeLumenAdapter } from '@busos/lumen-adapter';
import { getActionRepo, getActionRegistry, getMemoryService } from './api.js';

export type GenerateVisualReferenceMode = 'DEMO';

export interface GenerateVisualReferenceInput {
  projectId: string;
  prompt: string;
  sourceImageBase64: string;
  sourceImageMimeType: string;
  title?: string;
  /**
   * H2-02 — the customer this project belongs to. When supplied, the governed
   * memory context is assembled and consumed by the action as a SEPARATE,
   * auditable business input (never concatenated into `prompt`).
   */
  customerId?: string;
}

export interface GenerateVisualReferenceResult {
  result: BusinessProcessResult;
  /** Always 'DEMO' here — fake data must never be labelled LIVE. */
  mode: GenerateVisualReferenceMode;
}

/**
 * Execute "Generate Visual Reference" for an existing Project in DEMO mode.
 *
 * @param idempotencyKey caller-supplied stable key (per Project + prompt +
 *   source image). The orchestrator replay its recorded outcome on a duplicate
 *   key, so a double-click cannot create a second Task/Asset.
 */
export async function runGenerateVisualReference(
  input: GenerateVisualReferenceInput,
  idempotencyKey: string,
): Promise<GenerateVisualReferenceResult> {
  const repo = getActionRepo();
  const registry = getActionRegistry();
  const result = await runCreativeProjectAction(
    input,
    {
      businessRepository: repo,
      lumen: createFakeLumenAdapter(),
      // H2-02 — wire the canonical governed Memory service; the action assembles
      // the context only when `input.customerId` is also present.
      memory: getMemoryService(),
    },
    { idempotencyKey, registry },
  );
  return { result, mode: 'DEMO' };
}

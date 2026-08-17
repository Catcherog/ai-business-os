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
import { getActionRepo, getActionRegistry } from './api.js';

export type GenerateVisualReferenceMode = 'DEMO';

export interface GenerateVisualReferenceInput {
  projectId: string;
  prompt: string;
  sourceImageBase64: string;
  sourceImageMimeType: string;
  title?: string;
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
    { businessRepository: repo, lumen: createFakeLumenAdapter() },
    { idempotencyKey, registry },
  );
  return { result, mode: 'DEMO' };
}

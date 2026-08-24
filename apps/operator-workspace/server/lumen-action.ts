/**
 * SERVER-ONLY Lumen Workflow boundary (CONNECTED mode).
 *
 * This module is NEVER bundled into the browser SPA. It is the single place
 * where real RunningHub credentials + the `RunningHubLumenAdapter` live. The
 * browser bundle only ever calls this via `POST /api/lumen/run` (see server.ts)
 * — it never holds the API key (§19).
 *
 * `runConnectedLumenWorkflow` builds the real adapter from the environment; if
 * credentials are absent it short-circuits to `BLOCKED` (honest — we never fake
 * a LIVE result). When credentials are present it runs the SAME `LumenWorkflowPort`
 * the DEMO path uses, against the real RunningHub engine.
 */
import {
  createRunningHubAdapterFromEnv,
  type LumenWorkflowInput,
  type LumenWorkflowPort,
  type LumenWorkflowRunResult,
} from '@busos/lumen-adapter';

export type LumenServerMode = 'CONNECTED' | 'BLOCKED';

export interface LumenServerResult {
  /** Present only when mode === 'CONNECTED'. */
  result?: LumenWorkflowRunResult;
  mode: LumenServerMode;
  /** Human-readable reason when BLOCKED (never a substitute for a real run). */
  reason?: string;
}

export interface LumenServerInput {
  workflowType?: string;
  sourceImageBase64?: string;
  sourceImageMimeType?: string;
  prompt?: string;
  params?: Record<string, string>;
}

const ALLOWED_TYPES = new Set([
  'PRODUCT_SHOT',
  'BACKGROUND_SWAP',
  'LOCAL_RETOUCH',
  'STYLE_VARIATION',
  'OUTPAINT',
]);

export function validateLumenInput(body: unknown): LumenWorkflowInput | { error: string } {
  const b = (body ?? {}) as LumenServerInput;
  if (!b.workflowType || !ALLOWED_TYPES.has(b.workflowType)) {
    return { error: 'workflowType must be one of PRODUCT_SHOT / BACKGROUND_SWAP / LOCAL_RETOUCH / STYLE_VARIATION / OUTPAINT' };
  }
  if (!b.sourceImageBase64) {
    return { error: 'sourceImageBase64 is required' };
  }
  return {
    workflowType: b.workflowType as LumenWorkflowInput['workflowType'],
    sourceImageBase64: b.sourceImageBase64,
    sourceImageMimeType: b.sourceImageMimeType ?? 'image/png',
    prompt: b.prompt ?? '',
    params: b.params ?? {},
  };
}

/**
 * Execute a Lumen workflow against the REAL RunningHub engine.
 *
 * @param env environment to read `RUNNINGHUB_*` credentials from (defaults to
 *   `process.env`). Injectable so the smoke probe can assert the BLOCKED gate
 *   without real secrets.
 */
export async function runConnectedLumenWorkflow(
  input: LumenWorkflowInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LumenServerResult> {
  const adapter: LumenWorkflowPort | null = createRunningHubAdapterFromEnv(env);

  // Credential gate — honest BLOCKED, never a faked LIVE result.
  if (!adapter) {
    return {
      mode: 'BLOCKED',
      reason: 'Missing RunningHub credentials (RUNNINGHUB_API_KEY / RUNNINGHUB_CONFIG_JSON). Real Lumen workflow cannot run.',
    };
  }

  const result = await adapter.runWorkflow(input);
  return { result, mode: 'CONNECTED' };
}

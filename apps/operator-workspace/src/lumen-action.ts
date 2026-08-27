/**
 * Lumen image-workbench actions (browser DEMO + CONNECTED LIVE).
 *
 * DEMO path runs the in-browser `FakeRunningHubAdapter` — no RunningHub secret
 * ever crosses the client boundary. LIVE path posts to the server CONNECTED
 * boundary (`/api/lumen/run`), which owns the real key; the browser only sends
 * the chosen capability + source image and receives the result (§19). The LIVE
 * path is honest: a BLOCKED server response is surfaced as a FAILED result with
 * `LIVE_BLOCKED`, never faked as a success.
 */
import {
  createFakeRunningHubAdapter,
  type LumenWorkflowInput,
  type LumenWorkflowRunResult,
  type LumenWorkflowPort,
} from '@busos/lumen-adapter';

export type LumenRunMode = 'DEMO' | 'LIVE';

export interface LumenRunResult {
  result: LumenWorkflowRunResult;
  mode: LumenRunMode;
}

export type CreativeConnectedMode = 'CONNECTED' | 'BLOCKED';

export interface CreativeConnectedRunResult {
  result: LumenWorkflowRunResult;
  mode: CreativeConnectedMode;
}

/** In-browser DEMO execution against the FakeRunningHubAdapter (no secrets). */
export async function runLumenWorkflowDemo(
  input: LumenWorkflowInput,
  adapter: LumenWorkflowPort = createFakeRunningHubAdapter(),
): Promise<LumenRunResult> {
  const result = await adapter.runWorkflow(input);
  return { result, mode: 'DEMO' };
}

/**
 * CONNECTED execution: browser posts to the server boundary, which owns the
 * real RunningHub key. The server returns CONNECTED (real result) or BLOCKED
 * (no creds). We never see the key here.
 */
export async function runLumenWorkflowLive(input: LumenWorkflowInput): Promise<LumenRunResult> {
  let resp: Response;
  try {
    resp = await fetch('/api/lumen/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch (e) {
    return {
      result: {
        status: 'FAILED',
        workflowType: input.workflowType,
        outputImages: [],
        provider: 'RUNNINGHUB',
        errorCode: 'LIVE_UNREACHABLE',
        errorMessage: e instanceof Error ? e.message : String(e),
      },
      mode: 'LIVE',
    };
  }
  const json = (await resp.json().catch(() => ({}))) as {
    mode?: string;
    result?: LumenWorkflowRunResult;
    reason?: string;
  };
  if (json.mode === 'BLOCKED') {
    return {
      result: {
        status: 'FAILED',
        workflowType: input.workflowType,
        outputImages: [],
        provider: 'RUNNINGHUB',
        errorCode: 'LIVE_BLOCKED',
        errorMessage: json.reason ?? 'RunningHub not configured on the server boundary.',
      },
      mode: 'LIVE',
    };
  }
  return { result: (json.result ?? {
    status: 'FAILED',
    workflowType: input.workflowType,
    outputImages: [],
    provider: 'RUNNINGHUB',
    errorCode: 'LIVE_NO_RESULT',
    errorMessage: 'server returned no result',
  }) as LumenWorkflowRunResult, mode: 'LIVE' };
}

/**
 * Unified Creative surface adapter. The legacy Lumen action retains its LIVE
 * return type for backwards-compatible tests, while the V1 product surface
 * exposes the truthful operator vocabulary: a server-bound request is either
 * CONNECTED or explicitly BLOCKED. No blocked request is relabelled DEMO.
 */
export async function runLumenWorkflowConnected(
  input: LumenWorkflowInput,
): Promise<CreativeConnectedRunResult> {
  const out = await runLumenWorkflowLive(input);
  const blocked = out.result.errorCode === 'LIVE_BLOCKED' || out.result.errorCode === 'LIVE_UNREACHABLE';
  return { result: out.result, mode: blocked ? 'BLOCKED' : 'CONNECTED' };
}

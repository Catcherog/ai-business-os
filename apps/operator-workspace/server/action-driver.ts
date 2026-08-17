/**
 * H1-04 — server action driver + smoke probe.
 *
 * `runConnectedProbe` is the headless entry the smoke exercises: it drives the
 * CONNECTED boundary with a synthetically-valid input but NO credentials, so the
 * boundary MUST short-circuit to `BLOCKED`. This proves the server-only gate is
 * wired correctly (and that, without live credentials, we never claim a LIVE
 * success). With real `FEISHU_*` / `LUMEN_*` present it would instead run the
 * real action and return mode `CONNECTED`.
 */
import { runConnectedGenerateVisualReference } from './workspace-action.js';

export { runConnectedGenerateVisualReference } from './workspace-action.js';

export interface ConnectedProbeResult {
  mode: 'CONNECTED' | 'BLOCKED';
  reason?: string;
}

export async function runConnectedProbe(env: NodeJS.ProcessEnv = process.env): Promise<ConnectedProbeResult> {
  const out = await runConnectedGenerateVisualReference(
    {
      projectId: 'probe-project',
      prompt: 'probe prompt (no real project)',
      sourceImageBase64: 'cHJvYmU=', // "probe"
      sourceImageMimeType: 'image/png',
    },
    'probe-key',
    env,
  );
  return { mode: out.mode, reason: out.reason };
}

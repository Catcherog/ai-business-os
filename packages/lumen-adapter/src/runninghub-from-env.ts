import { RunningHubLumenAdapter } from './runninghub-lumen-adapter.js';
import type {
  LumenWorkflowPort,
  LumenWorkflowType,
  RunningHubAdapterConfig,
  RunningHubWorkflowConfig,
} from './workflow-types.js';

/**
 * Build the REAL RunningHub-backed Lumen adapter from environment variables
 * (never hardcode secrets). Returns null when the required connection details
 * are absent so the live Lumen run can be marked BLOCKED instead of faking
 * success (§19). The per-capability RunningHub wiring (workflow ids + node
 * slots) is owner-supplied JSON — the OS never invents node graphs.
 *
 * Required:
 *   RUNNINGHUB_API_KEY         RunningHub API key (server-only secret).
 * Optional:
 *   RUNNINGHUB_API_BASE_URL    RunningHub host (default https://www.runninghub.cn).
 *   RUNNINGHUB_CONFIG_JSON     JSON map of LumenWorkflowType -> RunningHubWorkflowConfig.
 *                              When absent, every capability is unconfigured and the
 *                              adapter returns WORKFLOW_NOT_CONFIGURED (honest BLOCKED).
 */
export function createRunningHubAdapterFromEnv(env: NodeJS.ProcessEnv = process.env): LumenWorkflowPort | null {
  const apiKey = env.RUNNINGHUB_API_KEY;
  if (!apiKey) return null;
  const baseUrl = env.RUNNINGHUB_API_BASE_URL;
  const workflows = parseWorkflowConfig(env);
  const config: RunningHubAdapterConfig = { apiKey, apiBaseUrl: baseUrl, workflows };
  return new RunningHubLumenAdapter(config);
}

function parseWorkflowConfig(
  env: NodeJS.ProcessEnv,
): Partial<Record<LumenWorkflowType, RunningHubWorkflowConfig>> {
  const raw = env.RUNNINGHUB_CONFIG_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Partial<Record<LumenWorkflowType, RunningHubWorkflowConfig>>;
    return parsed ?? {};
  } catch {
    // Malformed config -> treat as "no workflows configured" (safe: BLOCKED).
    return {};
  }
}
